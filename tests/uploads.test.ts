import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

// PNG 파일 맨 앞 8바이트(서명). 내용 비교용 작은 가짜 이미지예요.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('이미지 정적 서빙 (/uploads)', () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'uploads-'));
    await mkdir(path.join(dir, 'menus'));
    await writeFile(path.join(dir, 'sample.png'), PNG);
    await writeFile(path.join(dir, 'menus', '12.WEBP'), 'webp');
    await writeFile(path.join(dir, 'note.txt'), 'text');
    await writeFile(path.join(dir, 'logo.svg'), '<svg><script>alert(1)</script></svg>');
    await writeFile(path.join(dir, '.secret.png'), PNG);
    app = createApp({ uploadDir: dir });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('이미지 파일을 그대로 내려준다 (Content-Type · nosniff · 하루 캐시)', async () => {
    const res = await request(app).get('/uploads/sample.png');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
  });

  it('하위 폴더 · 대문자 확장자도 된다', async () => {
    const res = await request(app).get('/uploads/menus/12.WEBP');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
  });

  it('없는 파일 · 이미지가 아닌 파일 · SVG · 점(.) 파일 · 폴더는 404 JSON', async () => {
    for (const url of [
      '/uploads/none.png',
      '/uploads/note.txt',
      '/uploads/logo.svg',
      '/uploads/.secret.png',
      '/uploads/menus',
      '/uploads/menus/',
      '/uploads/',
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.body, url).toEqual({ code: 'NOT_FOUND', message: expect.any(String) as string });
    }
  });

  it('폴더 밖 파일은 내려주지 않는다 (../)', async () => {
    const res = await request(app).get('/uploads/..%2f..%2fetc%2fpasswd.png');

    expect(res.status).not.toBe(200);
  });
});
