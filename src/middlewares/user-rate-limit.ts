import type { Response } from 'express';

import type { AppAuthLocals } from './app-auth.js';
import { rateLimit } from './rate-limit.js';
import { UnauthorizedError } from '../utils/http-error.js';

interface UserRateLimitOptions {
  scope: string;
  limit: number;
  windowSeconds: number;
}

/**
 * 로그인한 사용자 ID를 기준으로 요청을 제한한다.
 *
 * 반드시 requireAppAuth 뒤에서 사용해야 한다.
 */
export function userRateLimit({ scope, limit, windowSeconds }: UserRateLimitOptions) {
  return rateLimit({
    scope,
    limit,
    windowSeconds,

    keyGenerator: (_req, res: Response) => {
      const { auth } = res.locals as Partial<AppAuthLocals>;

      if (!auth) {
        throw new UnauthorizedError();
      }

      return `user:${auth.userId}`;
    },
  });
}
