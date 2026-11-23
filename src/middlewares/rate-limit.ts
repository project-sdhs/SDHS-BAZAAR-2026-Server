import type { Request, RequestHandler } from 'express';

import { checkRateLimit } from '../db/rate-limit.js';
import { TooManyRequestsError } from '../utils/http-error.js';

/**
 * SRV-12: HTTP 요청 횟수 제한 미들웨어
 *
 * Redis에 저장된 횟수로 요청을 허용하거나 429를 반환한다.
 * 기본 키는 요청 종류 + 클라이언트 IP이다.
 */

export interface RateLimitOptions {
  /** 제한을 구분하는 이름 (예: login, qr, payment) */
  scope: string;

  /** 제한 시간 안에 허용할 최대 요청 수 */
  limit: number;

  /** 제한 시간 (초) */
  windowSeconds: number;

  /** 선택적 요청 식별 함수 */
  keyGenerator?: (req: Request) => string;
}

/**
 * 사용자 IP를 기준으로 요청을 구분한다.
 * 프록시 설정은 서버 배포 환경에서 별도로 검토해야 한다.
 */
function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

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
      const identity = keyGenerator(req);

      if (!identity.trim()) {
        throw new Error('Rate Limit 식별 키가 비어 있습니다.');
      }

      // 각 기능별 제한을 분리한다.
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
      // Redis 장애 등은 공통 에러 핸들러에 전달한다.
      // 결제·충전 요청을 제한 없이 통과시키지 않는다.
      next(error);
    }
  };
}
