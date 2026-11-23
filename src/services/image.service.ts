import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fileTypeFromBuffer } from 'file-type';
import sharp, { type OutputInfo } from 'sharp';

import { HttpError } from '../utils/http-error.js';

/** 받는 이미지 형식. SVG(스크립트를 넣을 수 있음) · GIF · HEIC 는 받지 않아요. */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 저장할 때 긴 쪽 최대 픽셀. 더 작은 사진은 키우지 않아요. */
export const IMAGE_MAX_SIDE = 1280;

/** 압축 폭탄(작은 파일이 풀면 거대한 이미지) 방지: 4000만 픽셀까지만 열어요. */
const MAX_INPUT_PIXELS = 40_000_000;

/** 이미지를 저장하는 폴더 (UPLOAD_DIR 아래) */
export const IMAGE_FOLDERS = ['booths', 'menus'] as const;
export type ImageFolder = (typeof IMAGE_FOLDERS)[number];

export interface SavedImage {
  /** UPLOAD_DIR 기준 경로. DB 에는 이 값을 저장해요. 예: "menus/3f2c….webp" */
  path: string;
  /** 앱 · 웹이 쓰는 주소. 예: "/uploads/menus/3f2c….webp" */
  url: string;
  width: number;
  height: number;
  /** 저장한 파일 크기 (바이트) */
  bytes: number;
}

function unsupportedImage(): HttpError {
  return new HttpError(
    415,
    'VALIDATION_FAILED',
    'JPG · PNG · WEBP 이미지만 올릴 수 있어요. 파일이 손상되지 않았는지 확인해 주세요.',
  );
}

/**
 * 이미지를 검사 · 정리해서 UPLOAD_DIR/<folder>/<무작위 이름>.webp 로 저장해요.
 * 1. 파일 앞부분 바이트(매직 넘버)로 진짜 형식을 확인해요. 확장자 · Content-Type 은 믿지 않아요.
 * 2. 휴대폰 사진의 회전 정보(EXIF)대로 바로 세우고, 긴 쪽을 1280px 이하로 줄여요.
 * 3. WEBP 로 바꿔 저장해요. 위치(GPS) 같은 메타데이터는 이때 모두 지워져요.
 * 4. 이름은 매번 새로 만들어요. (/uploads 는 하루 캐시라 같은 이름에 덮어쓰면 옛 사진이 보여요)
 */
export async function saveImage(
  buffer: Buffer,
  { uploadDir, folder }: { uploadDir: string; folder: ImageFolder },
): Promise<SavedImage> {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !ALLOWED_MIME_TYPES.has(type.mime)) {
    throw unsupportedImage();
  }

  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: IMAGE_MAX_SIDE,
        height: IMAGE_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // 앞부분만 이미지인 깨진 파일 · 너무 큰 이미지
    throw unsupportedImage();
  }

  const name = `${randomUUID()}.webp`;
  const dir = path.join(uploadDir, folder);
  await mkdir(dir, { recursive: true });
  // wx: 같은 이름이 이미 있으면 덮어쓰지 않고 에러 (UUID 라 사실상 겹치지 않아요)
  await writeFile(path.join(dir, name), output.data, { flag: 'wx' });

  const relativePath = `${folder}/${name}`;
  return {
    path: relativePath,
    url: `/uploads/${relativePath}`,
    width: output.info.width,
    height: output.info.height,
    bytes: output.info.size,
  };
}