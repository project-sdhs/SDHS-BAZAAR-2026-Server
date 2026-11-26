import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../src/middlewares/error-handler.js';
import { requireAppOpen, requireEventPeriod } from '../src/middlewares/operation-guard.js';

import { getPublicSettings } from '../src/services/public-settings.service.js';

/**
 * SRV-13 + SRV-20 캐시 연동 테스트
 *
 * 실제 Redis와 MySQL에 연결하지 않는다.
 * SRV-20 공개 설정 서비스를 Mock 처리한다.
 */
vi.mock('../src/services/public-settings.service.js', () => ({
  getPublicSettings: vi.fn(),
}));

const mockedGetPublicSettings = vi.mocked(getPublicSettings);

const settings = {
  appOpen: true,
  eventName: '테스트 바자회',
  eventStartDate: '2027-11-20',
  eventEndDate: '2027-11-21',
  depositAccount: null,
  depositorNameRule: '{studentNo} {name}',
  depositorNameExample: '2205 이재원',
  depositorNameRuleWithCode: '{depositCode} {name}',
  depositorNameExampleWithCode: 'V3071 김하린',
  chargeMin: 1000,
  chargeMax: null,
  balanceLimit: null,
};

/**
 * 테스트 전용 Express 앱.
 */
function createTestApp() {
  const app = express();

  app.get('/app', requireAppOpen, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.post('/charge', requireEventPeriod, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.use(errorHandler);

  return app;
}

describe('SRV-13 공개 설정 캐시 연동', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedGetPublicSettings.mockResolvedValue({
      ...settings,
    });
  });

  it('앱이 공개되어 있으면 HTTP 200을 반환한다', async () => {
    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
    });

    expect(mockedGetPublicSettings).toHaveBeenCalledOnce();
  });

  it('앱이 비공개이면 HTTP 503 APP_NOT_OPEN을 반환한다', async () => {
    mockedGetPublicSettings.mockResolvedValue({
      ...settings,
      appOpen: false,
    });

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'APP_NOT_OPEN',
    });
  });

  it('행사 종료 후 충전 요청은 HTTP 409 EVENT_ENDED를 반환한다', async () => {
    mockedGetPublicSettings.mockResolvedValue({
      ...settings,
      eventEndDate: '2020-01-01',
    });

    const response = await request(createTestApp()).post('/charge');

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'EVENT_ENDED',
    });
  });

  it('행사 시작 전에도 충전을 허용한다', async () => {
    mockedGetPublicSettings.mockResolvedValue({
      ...settings,
      eventStartDate: '2099-01-01',
      eventEndDate: '2099-12-31',
    });

    const response = await request(createTestApp()).post('/charge');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
    });
  });

  it('기본 운영 시간과 관계없이 충전 기간을 판단한다', async () => {
    const response = await request(createTestApp()).post('/charge');

    expect(response.status).toBe(200);
    expect(mockedGetPublicSettings).toHaveBeenCalledOnce();
  });

  it('앱 공개 검사에 SRV-20 설정 조회 서비스를 사용한다', async () => {
    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(200);
    expect(mockedGetPublicSettings).toHaveBeenCalledTimes(1);
  });

  it('충전 검사에도 동일한 설정 조회 서비스를 사용한다', async () => {
    const response = await request(createTestApp()).post('/charge');

    expect(response.status).toBe(200);
    expect(mockedGetPublicSettings).toHaveBeenCalledTimes(1);
  });

  it('설정 조회 중 오류가 발생하면 HTTP 500을 반환한다', async () => {
    mockedGetPublicSettings.mockRejectedValue(new Error('설정 조회 실패'));

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      code: 'INTERNAL',
    });
  });
});
