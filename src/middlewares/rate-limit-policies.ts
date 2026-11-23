import type { RequestHandler } from 'express';

import { rateLimit } from './rate-limit.js';
import { userRateLimit } from './user-rate-limit.js';

/**
 * SRV-12: 기능별 요청 횟수 제한 정책
 *
 * 실제 허용 횟수와 시간은 SRV-12 티켓 기준으로 설정한다.
 * 이 파일에서는 임의의 제한 수치를 정하지 않는다.
 */

export interface LimitConfig {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitPolicies {
  login: LimitConfig;
  qr: LimitConfig;
  payment: LimitConfig;
  charge: LimitConfig;
  menu: LimitConfig;
}

export interface RateLimitMiddlewares {
  login: RequestHandler;
  qr: RequestHandler;
  payment: RequestHandler;
  charge: RequestHandler;
  menu: RequestHandler;
}

/**
 * 기능별 미들웨어를 생성한다.
 *
 * 로그인·QR·메뉴: IP 기준
 * 결제·충전: 인증된 사용자 ID 기준
 */
export function createRateLimitMiddlewares(policies: RateLimitPolicies): RateLimitMiddlewares {
  return {
    login: rateLimit({
      scope: 'login',
      ...policies.login,
    }),

    qr: rateLimit({
      scope: 'qr',
      ...policies.qr,
    }),

    payment: userRateLimit({
      scope: 'payment',
      ...policies.payment,
    }),

    charge: userRateLimit({
      scope: 'charge',
      ...policies.charge,
    }),

    menu: rateLimit({
      scope: 'menu',
      ...policies.menu,
    }),
  };
}
