import type { Request, RequestHandler, Response } from 'express';

import { checkRateLimit } from '../db/rate-limit.js';
import { TooManyRequestsError } from '../utils/http-error.js';

export interface RateLimitOptions {
  scope: string;
  limit: number;
  windowSeconds: number;

  /** 요청별 제한 식별값. 기본값은 클라이언트 IP */
  keyGenerator?: (req: Request, res: Response) => string;
}

/** 클라이언트 IP를 식별한다. */
function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * SRV-12: Redis 기반 요청 횟수 제한 미들웨어.
 *
 * 제한 이내: 다음 미들웨어 실행
 * 제한 초과: 429 RATE_LIMITED
 * Redis 장애: 공통 에러 핸들러로 전달 (제한 우회 방지)
 */
export function rateLimit({
  scope,
  limit,
  windowSeconds,
  keyGenerator = clientKey,
}: RateLimitOptions): RequestHandler {
  if (!scope.trim()) {
    throw new Error('Rate Limit scope가 비어 있습니다.');
  }

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('Rate Limit limit은 양의 정수여야 합니다.');
  }

  if (!Number.isSafeInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error('Rate Limit windowSeconds는 양의 정수여야 합니다.');
  }

  return async (req, res, next) => {
    try {
      const identity = keyGenerator(req, res);

      if (!identity.trim()) {
        throw new Error('Rate Limit 식별 키가 비어 있습니다.');
      }

      const key = `${scope}:${identity}`;
      const result = await checkRateLimit(key, limit, windowSeconds);

      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(result.remaining));

      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));

        next(new TooManyRequestsError());
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
