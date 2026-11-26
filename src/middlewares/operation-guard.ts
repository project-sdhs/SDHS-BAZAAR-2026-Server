import type { RequestHandler } from 'express';

import { findActiveSettings } from '../repositories/bazaar-settings.repository.js';

import { checkAppVisibility, checkEventPeriod } from '../services/bazaar-operation.service.js';

import { ConflictError, HttpError } from '../utils/http-error.js';

/**
 * SRV-13: 바자회 운영 상태 검사 미들웨어
 *
 * API 문서 공통 규칙 10 기준.
 *
 * 앱 비공개 상태 검사와 행사 종료 후 충전 제한을 담당한다.
 *
 * 부스별 주문 상태는 QR 조회 및 결제 서비스에서
 * assertBoothPaymentAllowed()를 사용하여 검사한다.
 */

/**
 * 일반 앱 API의 공개 여부 검사.
 *
 * 비공개 상태에서는 503 APP_NOT_OPEN을 반환한다.
 *
 * 다음 경로에는 적용하지 않는다.
 * - /auth/*
 * - /users/me
 * - /settings/public
 * - /health
 * - 관리자 백오피스 API
 *
 * 실제 앱 라우터 구성 시 위 예외를 반영해야 한다.
 *
 * TODO(SRV-20):
 * 설정 조회를 공개 설정의 10초 캐시와 통합한다.
 */
export const requireAppOpen: RequestHandler = async (_req, _res, next) => {
  try {
    const settings = await findActiveSettings();

    const result = checkAppVisibility(settings);

    if (!result.allowed) {
      throw new HttpError(503, 'APP_NOT_OPEN', '아직 앱이 공개되지 않았습니다.');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 충전 요청에 사용하는 행사 종료 검사.
 *
 * - 행사 시작 전 충전 허용
 * - 행사 종료일 당일까지 충전 허용
 * - 행사 종료일 다음 날 00:00(KST)부터 차단
 *
 * 행사 종료 후:
 * HTTP 409 EVENT_ENDED
 *
 * 기본 운영 시간은 충전을 차단하는 조건이 아니다.
 */
export const requireEventPeriod: RequestHandler = async (_req, _res, next) => {
  try {
    const settings = await findActiveSettings();

    const result = checkEventPeriod(settings);

    if (!result.allowed) {
      throw new ConflictError({
        code: 'EVENT_ENDED',
        message: '바자회가 종료되어 충전할 수 없습니다.',
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
