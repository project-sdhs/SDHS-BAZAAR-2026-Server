import { describe, expect, it } from 'vitest';

import type { BoothOperation } from '../src/repositories/booth-operation.repository.js';
import { assertBoothPaymentAllowed } from '../src/services/booth-operation.service.js';
import { HttpError } from '../src/utils/http-error.js';

/**
 * SRV-13: 부스 결제 차단 오류 테스트
 *
 * 실제 DB를 사용하지 않고 운영 상태와 HTTP 오류를 검사한다.
 */

const booth: BoothOperation = {
  id: 1,
  name: '테스트 타코야끼',
  manualStatus: 'open',
  orderingPaused: false,
  pausedAt: null,
  openTime: '10:00:00',
  closeTime: '15:00:00',
};

// 2027-11-20 12:00:00 KST
const operatingTime = new Date('2027-11-20T03:00:00Z');

function getError(target: BoothOperation, now: Date = operatingTime): HttpError | null {
  try {
    assertBoothPaymentAllowed(target, now);
    return null;
  } catch (error) {
    if (error instanceof HttpError) {
      return error;
    }

    throw error;
  }
}

describe('SRV-13 부스 결제 가능 상태', () => {
  it('정상 운영 중인 부스는 결제를 허용한다', () => {
    expect(getError(booth)).toBeNull();
  });

  it('주문 정지 상태라면 409 ORDERING_PAUSED를 반환한다', () => {
    const error = getError({
      ...booth,
      orderingPaused: true,
      pausedAt: '2027-11-20T02:30:00.000Z',
    });

    expect(error).toBeInstanceOf(HttpError);
    expect(error?.status).toBe(409);
    expect(error?.code).toBe('ORDERING_PAUSED');
  });

  it('주문 정지 오류에 pausedAt과 부스 정보를 포함한다', () => {
    const error = getError({
      ...booth,
      orderingPaused: true,
      pausedAt: '2027-11-20T02:30:00.000Z',
    });

    expect(error?.extra).toEqual({
      pausedAt: '2027-11-20T02:30:00.000Z',
      booth: {
        id: 1,
        name: '테스트 타코야끼',
      },
    });
  });

  it('준비 중인 부스는 409 BOOTH_CLOSED를 반환한다', () => {
    const error = getError({
      ...booth,
      manualStatus: 'preparing',
    });

    expect(error?.status).toBe(409);
    expect(error?.code).toBe('BOOTH_CLOSED');
  });

  it('마감된 부스는 409 BOOTH_CLOSED를 반환한다', () => {
    const error = getError({
      ...booth,
      manualStatus: 'closed',
    });

    expect(error?.status).toBe(409);
    expect(error?.code).toBe('BOOTH_CLOSED');
  });

  it('운영 시작 전에는 409 BOOTH_CLOSED를 반환한다', () => {
    // 한국 시간 09:59:59
    const now = new Date('2027-11-20T00:59:59Z');

    const error = getError(booth, now);

    expect(error?.status).toBe(409);
    expect(error?.code).toBe('BOOTH_CLOSED');
  });

  it('운영 시작 시각에는 결제를 허용한다', () => {
    // 한국 시간 10:00:00
    const now = new Date('2027-11-20T01:00:00Z');

    expect(getError(booth, now)).toBeNull();
  });

  it('운영 종료 직전까지 결제를 허용한다', () => {
    // 한국 시간 14:59:59
    const now = new Date('2027-11-20T05:59:59Z');

    expect(getError(booth, now)).toBeNull();
  });

  it('운영 종료 시각부터 409 BOOTH_CLOSED를 반환한다', () => {
    // 한국 시간 15:00:00
    const now = new Date('2027-11-20T06:00:00Z');

    const error = getError(booth, now);

    expect(error?.status).toBe(409);
    expect(error?.code).toBe('BOOTH_CLOSED');
  });

  it('주문 정지 시각이 null이어도 응답에 필드를 포함한다', () => {
    const error = getError({
      ...booth,
      orderingPaused: true,
      pausedAt: null,
    });

    expect(error?.code).toBe('ORDERING_PAUSED');
    expect(error?.extra).toMatchObject({
      pausedAt: null,
      booth: {
        id: 1,
        name: '테스트 타코야끼',
      },
    });
  });

  it('준비 중이면서 주문 정지 상태라면 BOOTH_CLOSED를 반환한다', () => {
    const error = getError({
      ...booth,
      manualStatus: 'preparing',
      orderingPaused: true,
    });

    expect(error?.status).toBe(409);
    expect(error?.code).toBe('BOOTH_CLOSED');
  });
});
