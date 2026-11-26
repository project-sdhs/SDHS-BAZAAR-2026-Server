import type { Request, RequestHandler, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

import { checkRateLimit } from '../db/rate-limit.js';
import { TooManyRequestsError } from '../utils/http-error.js';

export interface RateLimitOptions<
  Locals extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Separate Redis buckets for different endpoints or policies. */
  scope: string;
  limit: number;
  windowSeconds: number;
  key: (req: Request, res: Response<unknown, Locals>) => string;
}

/** Create a route-level limiter backed by the shared Redis counter. */
export function createRateLimitMiddleware<
  Locals extends Record<string, unknown> = Record<string, unknown>,
>({
  scope,
  limit,
  windowSeconds,
  key,
}: RateLimitOptions<Locals>): RequestHandler<ParamsDictionary, unknown, unknown, ParsedQs, Locals> {
  return async (req, res, next) => {
    const result = await checkRateLimit(`${scope}:${key(req, res)}`, limit, windowSeconds);

    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, result.retryAfterSeconds)));
      next(new TooManyRequestsError());
      return;
    }

    next();
  };
}

/** Use the client IP for unauthenticated endpoints such as login and QR lookup. */
export function clientIpKey(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress;
  if (!ip) {
    throw new Error('요청 IP를 확인할 수 없습니다.');
  }
  return ip;
}
