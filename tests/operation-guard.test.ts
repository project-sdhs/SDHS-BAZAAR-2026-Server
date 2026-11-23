import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findActiveSettings } from '../src/repositories/bazaar-settings.repository.js';
import { findBoothOperation } from '../src/repositories/booth-operation.repository.js';

import {
  requireAppOpen,
  requireBazaarOperation,
  requireBoothOperation,
  requireEventPeriod,
} from '../src/middlewares/operation-guard.js';

import { errorHandler } from '../src/middlewares/error-handler.js';

vi.mock('../src/repositories/bazaar-settings.repository.js', () => ({
  findActiveSettings: vi.fn(),
}));

vi.mock('../src/repositories/booth-operation.repository.js', () => ({
  findBoothOperation: vi.fn(),
}));

const mockedSettings = vi.mocked(findActiveSettings);
const mockedBooth = vi.mocked(findBoothOperation);

const settings = {
  id: 1,
  eventName: '테스트 바자회',
  eventStartDate: '2020-01-01',
  eventEndDate: '2099-12-31',
  defaultOpenTime: '00:00:00',
  defaultCloseTime: '23:59:59',
  appOpen: true,
};

const booth = {
  id: 1,
  manualStatus: 'open' as const,
  orderingPaused: false,
  openTime: '00:00:00',
  closeTime: '23:59:59',
};

/**
 * SRV-13 HTTP 테스트용 앱
 * 실제 서비스 라우터를 변경하지 않는다.
 */
function createTestApp() {
  const app = express();

  app.get('/app', requireAppOpen, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.get('/event', requireEventPeriod, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.get('/operation', requireBazaarOperation, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.get('/booths/:boothId/payment', requireBoothOperation, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.use(errorHandler);

  return app;
}

describe('SRV-13 Operation Guard Middleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedSettings.mockResolvedValue({ ...settings });
    mockedBooth.mockResolvedValue({ ...booth });
  });

  it('앱이 공개 상태라면 HTTP 200을 반환한다', async () => {
    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
    });

    expect(mockedSettings).toHaveBeenCalledOnce();
  });

  it('앱이 비공개 상태라면 HTTP 403을 반환한다', async () => {
    mockedSettings.mockResolvedValue({
      ...settings,
      appOpen: false,
    });

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('행사 기간이 종료되면 요청을 차단한다', async () => {
    mockedSettings.mockResolvedValue({
      ...settings,
      eventStartDate: '2020-01-01',
      eventEndDate: '2020-01-02',
    });

    const response = await request(createTestApp()).get('/event');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('행사 기간과 운영 시간이 정상이면 요청을 허용한다', async () => {
    const response = await request(createTestApp()).get('/operation');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
    });
  });

  it('잘못된 부스 ID는 HTTP 400을 반환한다', async () => {
    const response = await request(createTestApp()).get('/booths/abc/payment');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    expect(mockedBooth).not.toHaveBeenCalled();
  });

  it('존재하지 않는 부스는 HTTP 404를 반환한다', async () => {
    mockedBooth.mockResolvedValue(null);

    const response = await request(createTestApp()).get('/booths/999/payment');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('주문 정지 상태인 부스는 HTTP 403을 반환한다', async () => {
    mockedBooth.mockResolvedValue({
      ...booth,
      orderingPaused: true,
    });

    const response = await request(createTestApp()).get('/booths/1/payment');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('운영 중인 부스는 HTTP 200을 반환한다', async () => {
    const response = await request(createTestApp()).get('/booths/1/payment');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
    });

    expect(mockedBooth).toHaveBeenCalledWith(1);
  });

  it('DB 오류가 발생하면 HTTP 500을 반환한다', async () => {
    mockedSettings.mockRejectedValue(new Error('DB 연결 실패'));

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      code: 'INTERNAL',
    });
  });
});
