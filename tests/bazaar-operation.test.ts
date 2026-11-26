import { describe, expect, it } from 'vitest';

import {
  checkAppVisibility,
  checkEventPeriod,
  getSeoulDate,
} from '../src/services/bazaar-operation.service.js';

const settings = {
  appOpen: true,
  eventEndDate: '2027-11-21',
};

describe('SRV-13 한국 날짜 변환', () => {
  it('UTC 기준 시각을 한국 날짜로 변환한다', () => {
    expect(getSeoulDate(new Date('2027-11-20T15:00:00Z'))).toBe('2027-11-21');
  });

  it('한국 시간 자정 직전을 정확히 구분한다', () => {
    expect(getSeoulDate(new Date('2027-11-20T14:59:59Z'))).toBe('2027-11-20');
  });
});

describe('SRV-13 앱 공개 상태', () => {
  it('앱이 공개되어 있으면 허용한다', () => {
    expect(checkAppVisibility(settings)).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('앱이 비공개이면 차단한다', () => {
    expect(checkAppVisibility({ appOpen: false })).toEqual({
      allowed: false,
      status: 'APP_CLOSED',
    });
  });
});

describe('SRV-13 충전 가능 기간', () => {
  it('행사 시작 전에도 충전을 허용한다', () => {
    expect(checkEventPeriod(settings, new Date('2027-11-19T03:00:00Z'))).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('행사 진행 중 충전을 허용한다', () => {
    expect(checkEventPeriod(settings, new Date('2027-11-20T03:00:00Z'))).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('행사 종료일 23시 59분 59초까지 허용한다', () => {
    expect(checkEventPeriod(settings, new Date('2027-11-21T14:59:59Z'))).toEqual({
      allowed: true,
      status: 'AVAILABLE',
    });
  });

  it('행사 종료일 다음 날 00시부터 차단한다', () => {
    expect(checkEventPeriod(settings, new Date('2027-11-21T15:00:00Z'))).toEqual({
      allowed: false,
      status: 'EVENT_ENDED',
    });
  });
});
