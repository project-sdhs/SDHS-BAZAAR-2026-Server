import type { RequestHandler } from 'express';

import { BadRequestError } from '../utils/http-error.js';
import { clientKey, rateLimit } from './rate-limit.js';
import { userRateLimit } from './user-rate-limit.js';

/**
 * SRV-12: API 문서 공통 규칙 9
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

/**
 * 공식 요청 횟수 제한 정책
 */
export const RATE_LIMIT_POLICIES = {
  login: {
    limit: 300,
    windowSeconds: 60,
  },
  qr: {
    limit: 30,
    windowSeconds: 60,
  },
  payment: {
    limit: 10,
    windowSeconds: 60,
  },
  charge: {
    limit: 5,
    windowSeconds: 600,
  },
  menu: {
    limit: 5,
    windowSeconds: 600,
  },
} as const satisfies RateLimitPolicies;

export interface RateLimitMiddlewares {
  login: RequestHandler;
  qr: RequestHandler;
  payment: RequestHandler;
  charge: RequestHandler;
  menu: RequestHandler;
}

/**
 * 메뉴판 연결 API의 앞선 검증 과정에서 설정하는 값.
 *
 * 반드시 실제 부스 코드 유효성 검증을 통과한 뒤
 * res.locals.verifiedBoardConnect에 기록해야 한다.
 *
 * 요청 본문의 boothCode를 직접 복사하면 안 된다.
 */
interface VerifiedBoardConnect {
  boothCode: string;
}

/**
 * 검증된 부스 코드를 읽는다.
 */
function getVerifiedBoothCode(locals: Record<string, unknown>): string {
  const verified = locals.verifiedBoardConnect as VerifiedBoardConnect | undefined;

  const boothCode = verified?.boothCode;

  if (typeof boothCode !== 'string' || !boothCode.trim()) {
    throw new BadRequestError({
      message: '검증된 부스 코드가 필요합니다.',
    });
  }

  return boothCode;
}

/**
 * 기능별 요청 횟수 제한 미들웨어.
 *
 * 인자를 생략하면 공식 정책이 적용된다.
 * 인자를 전달하면 테스트용 정책을 사용할 수 있다.
 *
 * 로그인: IP
 * QR 조회: 인증된 사용자
 * 결제: 인증된 사용자
 * 충전: 인증된 사용자
 * 메뉴판 연결: IP + 검증된 부스 코드
 */
export function createRateLimitMiddlewares(
  policies: RateLimitPolicies = RATE_LIMIT_POLICIES,
): RateLimitMiddlewares {
  return {
    login: rateLimit({
      scope: 'login',
      ...policies.login,
    }),

    // requireAppAuth 뒤에 배치
    qr: userRateLimit({
      scope: 'qr',
      ...policies.qr,
    }),

    // requireAppAuth 뒤에 배치
    payment: userRateLimit({
      scope: 'payment',
      ...policies.payment,
    }),

    // requireAppAuth 뒤에 배치
    charge: userRateLimit({
      scope: 'charge',
      ...policies.charge,
    }),

    menu: rateLimit({
      scope: 'board-connect',
      ...policies.menu,

      keyGenerator: (req, res) => {
        const boothCode = getVerifiedBoothCode(res.locals);

        return `ip:${clientKey(req)}:booth:${boothCode}`;
      },
    }),
  };
}

/**
 * 라우터에서 바로 사용할 공식 정책 미들웨어.
 */
export const rateLimitPolicies = createRateLimitMiddlewares();
