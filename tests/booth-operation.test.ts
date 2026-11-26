import { describe, expect, it } from 'vitest';

import type { BoothOperation } from '../src/repositories/booth-operation.repository.js';
import { checkBoothOperation } from '../src/services/booth-operation.service.js';

/**
 * SRV-13: 부스 운영 상태 단위 테스트
 * 실제 MySQL 연결 없이 고정된 상태와 한국 시간으로 검증한다.
 */

const booth: BoothOperation = {
  id: 1,
  name: '테스트 부스',
  manualStatus: 'open',
  orderingPaused: false,
  pausedAt: null,
  openTime: '10:00:00',
  closeTime: '15:00:00',
};
const at = (iso: string): Date => new Date(iso);

describe('SRV-13 부스 운영 상태 검사', () => {
  it('운영 중인 부스는 결제를 허용한다', () => {
    expect(checkBoothOperation(booth, at('2027-11-20T03:00:00Z'))).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('준비 중인 부스는 결제를 차단한다', () => {
    expect(
      checkBoothOperation({ ...booth, manualStatus: 'preparing' }, at('2027-11-20T03:00:00Z')),
    ).toEqual({
      allowed: false,
      status: 'BOOTH_PREPARING',
    });
  });

  it('닫힌 부스는 결제를 차단한다', () => {
    expect(
      checkBoothOperation({ ...booth, manualStatus: 'closed' }, at('2027-11-20T03:00:00Z')),
    ).toEqual({
      allowed: false,
      status: 'BOOTH_CLOSED',
    });
  });

  it('주문이 일시 정지된 부스는 결제를 차단한다', () => {
    expect(
      checkBoothOperation({ ...booth, orderingPaused: true }, at('2027-11-20T03:00:00Z')),
    ).toEqual({
      allowed: false,
      status: 'ORDERING_PAUSED',
    });
  });

  it('운영 시작 전에는 결제를 차단한다', () => {
    expect(checkBoothOperation(booth, at('2027-11-20T00:59:59Z'))).toEqual({
      allowed: false,
      status: 'BOOTH_BEFORE_OPEN',
    });
  });

  it('운영 시작 시각에는 결제를 허용한다', () => {
    expect(checkBoothOperation(booth, at('2027-11-20T01:00:00Z'))).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('운영 종료 직전까지 결제를 허용한다', () => {
    expect(checkBoothOperation(booth, at('2027-11-20T05:59:59Z'))).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('운영 종료 시각부터 결제를 차단한다', () => {
    expect(checkBoothOperation(booth, at('2027-11-20T06:00:00Z'))).toEqual({
      allowed: false,
      status: 'BOOTH_AFTER_CLOSE',
    });
  });

  it('준비 중이면서 주문 정지 상태라면 준비 중 상태를 먼저 반환한다', () => {
    expect(
      checkBoothOperation(
        {
          ...booth,
          manualStatus: 'preparing',
          orderingPaused: true,
        },
        at('2027-11-20T03:00:00Z'),
      ),
    ).toEqual({
      allowed: false,
      status: 'BOOTH_PREPARING',
    });
  });

  it('닫힌 상태라면 운영 시간이어도 결제를 차단한다', () => {
    expect(
      checkBoothOperation({ ...booth, manualStatus: 'closed' }, at('2027-11-20T03:00:00Z')),
    ).toEqual({
      allowed: false,
      status: 'BOOTH_CLOSED',
    });
  });
});
