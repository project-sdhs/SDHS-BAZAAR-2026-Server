import { describe, expect, it } from 'vitest';

import type { BazaarOperationSettings } from '../src/repositories/bazaar-settings.repository.js';

import {
  checkAppVisibility,
  checkBazaarOperation,
  checkEventPeriod,
  checkOperationHours,
} from '../src/services/bazaar-operation.service.js';

/**
 * SRV-13: 바자회 운영 상태 판단 테스트
 *
 * 실제 DB를 사용하지 않고 가상의 설정과 고정된 시각으로
 * 날짜 및 운영 시간 판정 로직을 검사한다.
 */

const settings: BazaarOperationSettings = {
  id: 1,
  eventName: '테스트 바자회',
  eventStartDate: '2027-11-20',
  eventEndDate: '2027-11-21',
  defaultOpenTime: '10:00:00',
  defaultCloseTime: '15:00:00',
  appOpen: true,
};

/**
 * ISO 8601 문자열을 UTC Date로 변환한다.
 * 2027-11-20T01:00:00Z = 한국 시간 10:00
 */
function at(iso: string): Date {
  return new Date(iso);
}

describe('SRV-13 행사 기간 검사', () => {
  it('행사 시작 전에는 이용을 허용하지 않는다', () => {
    const result = checkEventPeriod(settings, at('2027-11-19T05:00:00Z'));

    expect(result).toEqual({
      allowed: false,
      status: 'EVENT_NOT_STARTED',
    });
  });

  it('행사 시작일에는 이용을 허용한다', () => {
    const result = checkEventPeriod(settings, at('2027-11-20T01:00:00Z'));

    expect(result).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('행사 종료일도 행사 기간에 포함한다', () => {
    const result = checkEventPeriod(settings, at('2027-11-21T05:00:00Z'));

    expect(result).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('행사 종료일이 지나면 차단한다', () => {
    const result = checkEventPeriod(settings, at('2027-11-21T15:00:00Z'));

    // UTC 15:00 = 한국 시간 11월 22일 00:00
    expect(result).toEqual({
      allowed: false,
      status: 'EVENT_ENDED',
    });
  });
});

describe('SRV-13 기본 운영 시간 검사', () => {
  it('운영 시작 전에는 이용을 허용하지 않는다', () => {
    const result = checkOperationHours(settings, at('2027-11-20T00:59:59Z'));

    expect(result).toEqual({
      allowed: false,
      status: 'BEFORE_OPEN',
    });
  });

  it('운영 시작 시각은 포함한다', () => {
    const result = checkOperationHours(settings, at('2027-11-20T01:00:00Z'));

    expect(result).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('운영 중에는 이용을 허용한다', () => {
    const result = checkOperationHours(settings, at('2027-11-20T03:00:00Z'));

    expect(result).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('운영 종료 시각부터 이용을 차단한다', () => {
    const result = checkOperationHours(settings, at('2027-11-20T06:00:00Z'));

    expect(result).toEqual({
      allowed: false,
      status: 'AFTER_CLOSE',
    });
  });
});

describe('SRV-13 앱 공개 상태 검사', () => {
  it('앱이 공개되어 있으면 허용한다', () => {
    expect(checkAppVisibility(settings)).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('앱이 비공개라면 차단한다', () => {
    expect(
      checkAppVisibility({
        ...settings,
        appOpen: false,
      }),
    ).toEqual({
      allowed: false,
      status: 'APP_CLOSED',
    });
  });
});

describe('SRV-13 종합 운영 상태 검사', () => {
  it('행사 기간과 운영 시간을 모두 만족하면 허용한다', () => {
    const result = checkBazaarOperation(settings, at('2027-11-20T03:00:00Z'));

    expect(result).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('행사 기간 밖이면 시간보다 행사 기간을 우선 확인한다', () => {
    const result = checkBazaarOperation(settings, at('2027-11-22T03:00:00Z'));

    expect(result).toEqual({
      allowed: false,
      status: 'EVENT_ENDED',
    });
  });

  it('행사 기간 안이지만 운영 시간이 아니면 차단한다', () => {
    const result = checkBazaarOperation(settings, at('2027-11-20T07:00:00Z'));

    expect(result).toEqual({
      allowed: false,
      status: 'AFTER_CLOSE',
    });
  });
});
