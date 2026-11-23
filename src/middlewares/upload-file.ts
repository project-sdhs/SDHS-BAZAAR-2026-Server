import type { Request, RequestHandler } from 'express';
import multer from 'multer';

import { BadRequestError, HttpError } from '../utils/http-error.js';

/** 올릴 수 있는 최대 크기 (바이트) */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const CSV_MAX_BYTES = 2 * 1024 * 1024; // 2MB

/** 5242880 → "5MB" */
function toMegabytes(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`;
}

/** multer · busboy 가 던진 에러를 API 문서의 공통 에러(413 · 400 VALIDATION_FAILED)로 바꿔요. */
function toUploadError(err: unknown, field: string, maxBytes: number): HttpError {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const message = `파일이 너무 커요. ${toMegabytes(maxBytes)}까지 올릴 수 있어요.`;
      return new HttpError(413, 'VALIDATION_FAILED', message, { fields: { [field]: message } });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
      return new BadRequestError({
        fields: { [err.field ?? field]: `파일은 '${field}' 칸에 하나만 올려 주세요.` },
      });
    }
  }
  // 그 밖의 multer 제한 · 깨진 multipart 본문 · 업로드 도중 끊김
  return new BadRequestError({ message: '파일 업로드 요청이 올바르지 않아요.' });
}

/**
 * multipart/form-data 의 파일 하나를 메모리(req.file.buffer)로 받는 미들웨어.
 * - 크기 초과 → 413, 파일 없음 · 다른 칸 이름 · 여러 개 → 400, multipart 가 아님 → 415
 * - 받은 파일의 진짜 형식 검사 · 저장은 하지 않아요. saveImage · parseCsv 가 해요.
 *
 * @example
 * router.post('/menus/:id/image', ...uploadSingleFile('image', IMAGE_MAX_BYTES), updateMenuImage);
 */
export function uploadSingleFile(field: string, maxBytes: number): RequestHandler[] {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 20, parts: 30 },
  }).single(field);

  const receive: RequestHandler = (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      next(new HttpError(415, 'VALIDATION_FAILED', 'multipart/form-data 로 파일을 보내 주세요.'));
      return;
    }

    parse(req, res, (err?: unknown) => {
      next(err ? toUploadError(err, field, maxBytes) : undefined);
    });
  };

  const requireFile: RequestHandler = (req, _res, next) => {
    next(
      req.file ? undefined : new BadRequestError({ fields: { [field]: '파일을 올려 주세요.' } }),
    );
  };

  return [receive, requireFile];
}

/** uploadSingleFile 을 지난 요청에서 파일을 꺼내요. (없으면 400) */
export function uploadedFile(req: Request): Express.Multer.File {
  if (!req.file) {
    throw new BadRequestError({ message: '파일을 올려 주세요.' });
  }
  return req.file;
}