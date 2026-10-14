import type { Request, Response } from 'express';

import type { ErrorResponse } from '../utils/http-error.js';

/** 어떤 라우터에도 걸리지 않은 요청 → 404 */
export function notFound(req: Request, res: Response<ErrorResponse>): void {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `${req.method} ${req.path} 경로를 찾을 수 없습니다.`,
  });
}
