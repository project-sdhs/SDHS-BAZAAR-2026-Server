import type { NextFunction, Request, Response } from 'express';

import { NotFoundError } from '../utils/http-error.js';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError({ message: `${req.method} ${req.path} 경로를 찾을 수 없습니다.` }));
}
