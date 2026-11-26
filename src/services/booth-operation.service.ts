import type { BoothOperation } from '../repositories/booth-operation.repository.js';

import { ConflictError } from '../utils/http-error.js';

/**
 * SRV-13: 부스별 결제 가능 상태 판단
 */

export type BoothOperationStatus =
  | 'BOOTH_PREPARING'
  | 'BOOTH_CLOSED'
  | 'ORDERING_PAUSED'
  | 'BOOTH_BEFORE_OPEN'
  | 'BOOTH_AFTER_CLOSE'
  | 'AVAILABLE';

export interface BoothOperationResult {
  allowed: boolean;
  status: BoothOperationStatus;
}

/**
 * 현재 한국 시간을 HH:mm:ss 형식으로 반환한다.
 */
function seoulTime(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.hour}:${values.minute}:${values.second}`;
}

/**
 * 부스 운영 상태를 판단한다.
 *
 * 상태만 반환하고 HTTP 오류는 발생시키지 않는다.
 */
export function checkBoothOperation(
  booth: BoothOperation,
  now: Date = new Date(),
): BoothOperationResult {
  if (booth.manualStatus === 'preparing') {
    return {
      allowed: false,
      status: 'BOOTH_PREPARING',
    };
  }

  if (booth.manualStatus === 'closed') {
    return {
      allowed: false,
      status: 'BOOTH_CLOSED',
    };
  }

  if (booth.orderingPaused) {
    return {
      allowed: false,
      status: 'ORDERING_PAUSED',
    };
  }

  const time = seoulTime(now);

  if (time < booth.openTime) {
    return {
      allowed: false,
      status: 'BOOTH_BEFORE_OPEN',
    };
  }

  if (time >= booth.closeTime) {
    return {
      allowed: false,
      status: 'BOOTH_AFTER_CLOSE',
    };
  }

  return {
    allowed: true,
    status: 'AVAILABLE',
  };
}

/**
 * API 문서의 공식 오류 코드로 변환한다.
 *
 * 실제 QR 조회 및 결제 서비스에서 사용한다.
 */
export function assertBoothPaymentAllowed(booth: BoothOperation, now: Date = new Date()): void {
  const result = checkBoothOperation(booth, now);

  if (result.allowed) {
    return;
  }

  if (result.status === 'ORDERING_PAUSED') {
    throw new ConflictError({
      code: 'ORDERING_PAUSED',
      message: '현재 부스의 주문이 일시 정지되었습니다.',
      extra: {
        pausedAt: booth.pausedAt,
        booth: {
          id: booth.id,
          name: booth.name,
        },
      },
    });
  }

  throw new ConflictError({
    code: 'BOOTH_CLOSED',
    message: '현재 결제할 수 없는 부스입니다.',
  });
}
