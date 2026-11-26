import type { Request, RequestHandler, Response } from 'express';

import { checkRateLimit } from '../db/rate-limit.js';
import { TooManyRequestsError } from '../utils/http-error.js';

/**
 * SRV-12: Redis 기반 요청 횟수 제한 미들웨어
 */

export interface RateLimitOptions {
  /** Redis 키를 구분하는 기능 이름 */
  scope: string;

  /** 제한 시간 내 최대 요청 횟수 */
  limit: number;

  /** 제한 시간 (초) */
  windowSeconds: number;

  /**
   * 요청별 제한 식별값.
   * 기본값은 Express가 확인한 클라이언트 IP.
   */
  keyGenerator?: (req: Request, res: Response) => string;
}

/**
 * 클라이언트 IP 식별.
 *
 * Express 앱에서 trust proxy를 올바르게 설정해야 한다.
 * X-Forwarded-For 헤더를 직접 읽지 않는다.
 *
 * IP를 확인할 수 없으면 unknown 같은 공용 버킷을
 * 사용하지 않고 요청을 오류 처리한다.
 */
export function clientKey(req: Request): string {
  const ip = req.ip;

  if (typeof ip !== 'string' || !ip.trim()) {
    throw new Error('클라이언트 IP를 확인할 수 없습니다.');
  }

  return ip;
}

/**
 * Redis 기반 요청 횟수 제한 미들웨어를 생성한다.
 *
 * 제한 이내: 다음 미들웨어 실행
 * 제한 초과: 429 RATE_LIMITED
 * Redis 오류: 공통 오류 핸들러를 통해 500 처리
 *
 * 주의:
 * 사용자 ID 기준 제한이 필요한 API에서는
 * userRateLimit()을 사용해야 한다.
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

      if (typeof identity !== 'string' || !identity.trim()) {
        throw new Error('Rate Limit 식별 키가 비어 있습니다.');
      }

      const key = `${scope}:${identity}`;

      const result = await checkRateLimit(key, limit, windowSeconds);

      if (!result.allowed) {
        /**
         * API 문서:
         * Retry-After는 1 이상의 정수여야 한다.
         *
         * Redis 제한 창 종료 직전 0이 반환되어도
         * 최소 1초를 안내한다.
         */
        const retryAfter = Math.max(1, Math.ceil(result.retryAfterSeconds));

        res.setHeader('Retry-After', String(retryAfter));

        next(new TooManyRequestsError());
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
