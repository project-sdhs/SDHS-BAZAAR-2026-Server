import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorHandler } from '../src/middlewares/error-handler.js';
import { IMAGE_MAX_BYTES, uploadedFile, uploadSingleFile } from '../src/middlewares/upload-file.js';
import { IMAGE_MAX_SIDE, saveImage } from '../src/services/image.service.js';

const anyString = expect.any(String) as string;

/** 테스트용 이미지를 즉석에서 만들어요. (저장소에 이미지 파일을 넣지 않으려고) */
function makeImage(width: number, height: number, format: 'png' | 'jpeg' = 'png'): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 120, b: 0 } },
  });
  return format === 'png' ? image.png().toBuffer() : image.jpeg().toBuffer();
}

describe('이미지 업로드 (uploadSingleFile + saveImage)', () => {
  let uploadDir: string;
  let app: express.Express;

  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), 'upload-test-'));

    app = express();
    app.post('/image', ...uploadSingleFile('image', IMAGE_MAX_BYTES), async (req, res) => {
      const saved = await saveImage(uploadedFile(req).buffer, { uploadDir, folder: 'menus' });
      res.status(201).json(saved);
    });
    app.use(errorHandler);
  });

  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('큰 PNG 는 긴 쪽 1280px 로 줄여 WEBP 로 저장한다', async () => {
    const res = await request(app)
      .post('/image')
      .attach('image', await makeImage(3000, 2000), 'photo.png');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      path: expect.stringMatching(/^menus\/[0-9a-f-]{36}\.webp$/) as string,
      url: expect.stringMatching(/^\/uploads\/menus\/[0-9a-f-]{36}\.webp$/) as string,
      width: IMAGE_MAX_SIDE,
      height: 853,
      bytes: expect.any(Number) as number,
    });

    const saved = await readFile(path.join(uploadDir, (res.body as { path: string }).path));
    const meta = await sharp(saved).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: IMAGE_MAX_SIDE, height: 853 });
  });

  it('작은 이미지는 키우지 않고, 올릴 때마다 새 이름으로 저장한다', async () => {
    const image = await makeImage(200, 100, 'jpeg');
    const first = await request(app).post('/image').attach('image', image, 'a.jpg');
    const second = await request(app).post('/image').attach('image', image, 'a.jpg');

    expect(first.body).toMatchObject({ width: 200, height: 100 });
    expect((first.body as { path: string }).path).not.toBe((second.body as { path: string }).path);
  });

  it('휴대폰 사진의 회전 정보(EXIF)대로 세우고, 메타데이터는 지운다', async () => {
    // 가로 400 × 세로 200 으로 찍혔지만 "90도 돌려서 보라"는 정보가 붙은 사진
    const rotated = await sharp(await makeImage(400, 200, 'jpeg'))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const res = await request(app).post('/image').attach('image', rotated, 'phone.jpg');
    expect(res.body).toMatchObject({ width: 200, height: 400 });

    const saved = await readFile(path.join(uploadDir, (res.body as { path: string }).path));
    const meta = await sharp(saved).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('5MB 를 넘으면 413 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .post('/image')
      .attach('image', Buffer.alloc(IMAGE_MAX_BYTES + 1), 'big.png');

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: anyString,
      fields: { image: anyString },
      requestId: anyString,
    });
  });

  it('확장자만 이미지인 파일 · SVG · 깨진 이미지는 415 VALIDATION_FAILED', async () => {
    const png = await makeImage(100, 100);
    const files: [string, Buffer][] = [
      ['fake.png', Buffer.from('이건 그냥 글자예요')],
      [
        'logo.svg',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ],
      ['broken.png', png.subarray(0, 40)],
    ];

    for (const [name, buffer] of files) {
      const res = await request(app).post('/image').attach('image', buffer, name);
      expect(res.status, name).toBe(415);
      expect(res.body, name).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('파일이 없거나 다른 칸 이름으로 보내면 400 VALIDATION_FAILED', async () => {
    const noFile = await request(app).post('/image').field('name', '떡볶이');
    expect(noFile.status).toBe(400);
    expect(noFile.body).toMatchObject({ code: 'VALIDATION_FAILED', fields: { image: anyString } });

    const wrongField = await request(app)
      .post('/image')
      .attach('photo', await makeImage(10, 10), 'a.png');
    expect(wrongField.status).toBe(400);
    expect(wrongField.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { photo: anyString },
    });
  });

  it('multipart/form-data 가 아니면 415 VALIDATION_FAILED', async () => {
    const res = await request(app).post('/image').send({ image: 'base64...' });

    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});