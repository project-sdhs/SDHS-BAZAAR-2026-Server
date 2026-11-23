import type { RequestHandler } from 'express';

import { findActiveSettings } from '../repositories/bazaar-settings.repository.js';
import { findBoothOperation } from '../repositories/booth-operation.repository.js';

import {
  checkAppVisibility,
  checkBazaarOperation,
  checkEventPeriod,
  checkOperationHours,
  type OperationResult,
} from '../services/bazaar-operation.service.js';

import {
  checkBoothOperation,
  type BoothOperationResult,
} from '../services/booth-operation.service.js';

import { HttpError, NotFoundError } from '../utils/http-error.js';

/**
 * SRV-13: 바자회 운영 상태 검사 미들웨어
 *
 * 실제 API에 연결하기 전 단계.
 * 업무별 세부 오류 코드는 API 명세 확인 후 적용한다.
 */

function assertAllowed(result: OperationResult | BoothOperationResult): void {
  if (result.allowed) {
    return;
  }

  // 현재는 공통 오류를 사용한다.
  // 전용 상태 코드는 팀 API 명세에 맞춰 추후 변경한다.
  throw new HttpError(403, 'FORBIDDEN', `현재 요청을 처리할 수 없습니다. (${result.status})`);
}

/**
 * 앱 공개 여부 검사
 *
 * 일반 사용자 대상 API에 사용한다.
 * 관리자 설정 API에는 일괄 적용하지 않는다.
 */
export const requireAppOpen: RequestHandler = async (_req, _res, next) => {
  try {
    const settings = await findActiveSettings();

    assertAllowed(checkAppVisibility(settings));

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 행사 기간 검사
 *
 * 행사 시작일과 종료일을 확인한다.
 */
export const requireEventPeriod: RequestHandler = async (_req, _res, next) => {
  try {
    const settings = await findActiveSettings();

    assertAllowed(checkEventPeriod(settings));

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 기본 운영 시간 검사
 */
export const requireOperationHours: RequestHandler = async (_req, _res, next) => {
  try {
    const settings = await findActiveSettings();

    assertAllowed(checkOperationHours(settings));

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 행사 기간과 운영 시간을 함께 검사한다.
 *
 * 이 함수는 앱 공개 여부를 검사하지 않는다.
 */
export const requireBazaarOperation: RequestHandler = async (_req, _res, next) => {
  try {
    const settings = await findActiveSettings();

    assertAllowed(checkBazaarOperation(settings));

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 부스의 운영 상태와 주문 정지 여부를 검사한다.
 *
 * 라우트의 :boothId 매개변수를 사용한다.
 * 실제 결제 API의 파라미터 구조에 맞춰 연결해야 한다.
 */
export const requireBoothOperation: RequestHandler = async (req, _res, next) => {
  try {
    const rawId = req.params.boothId;

    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
      throw new HttpError(400, 'VALIDATION_FAILED', '올바른 부스 ID가 필요합니다.');
    }

    const boothId = Number(rawId);

    if (!Number.isSafeInteger(boothId)) {
      throw new HttpError(400, 'VALIDATION_FAILED', '부스 ID가 올바르지 않습니다.');
    }

    const booth = await findBoothOperation(boothId);

    if (!booth) {
      throw new NotFoundError({
        message: '부스를 찾을 수 없습니다.',
      });
    }

    assertAllowed(checkBoothOperation(booth));

    next();
  } catch (error) {
    next(error);
  }
};
