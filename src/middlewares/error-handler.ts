import type { NextFunction, Request, Response } from 'express';

import { HttpError, type ErrorResponse } from '../utils/http-error.js';

/** express.json()이 잘못된 JSON 본문을 받았을 때 만드는 에러인지 확인 */
function isJsonParseError(err: unknown): boolean {
  return err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed';
}

/**
 * 모든 에러를 { code, message } JSON으로 바꿔 응답해요.
 * Express는 매개변수가 4개인 함수를 에러 핸들러로 인식하므로 _next 를 지우면 안 돼요.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }

  if (isJsonParseError(err)) {
    res
      .status(400)
      .json({ code: 'INVALID_JSON', message: '요청 본문이 올바른 JSON 형식이 아닙니다.' });
    return;
  }

  console.error(err);
  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  });
}
