import type { BoothOperation } from '../repositories/booth-operation.repository.js';

/**
 * SRV-13: 부스별 결제 가능 상태 판단
 *
 * 시간 비교는 한국 시간(Asia/Seoul) 기준이다.
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
 * 부스의 현재 운영 상태를 검사한다.
 *
 * 이 함수는 HTTP 오류를 반환하지 않는다.
 * 실제 API에서 결과에 맞는 오류로 변환한다.
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
