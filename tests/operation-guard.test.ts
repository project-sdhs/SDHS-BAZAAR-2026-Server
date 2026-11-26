import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findActiveSettings } from '../src/repositories/bazaar-settings.repository.js';

import { requireAppOpen, requireEventPeriod } from '../src/middlewares/operation-guard.js';

import { errorHandler } from '../src/middlewares/error-handler.js';

vi.mock('../src/repositories/bazaar-settings.repository.js', () => ({
  findActiveSettings: vi.fn(),
}));

const mockedSettings = vi.mocked(findActiveSettings);

const settings = {
  id: 1,
  eventName: '테스트 바자회',
  eventStartDate: '2020-01-01',
  eventEndDate: '2099-12-31',
  defaultOpenTime: '00:00:00',
  defaultCloseTime: '23:59:59',
  appOpen: true,
};

/**
 * SRV-13 HTTP 테스트 전용 Express 앱.
 *
 * 실제 DB에 연결하지 않고 설정 조회를 Mock 처리한다.
 */
function createTestApp() {
  const app = express();

  app.get('/app', requireAppOpen, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.get('/charge', requireEventPeriod, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.use(errorHandler);

  return app;
}

describe('SRV-13 운영 상태 미들웨어', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedSettings.mockResolvedValue({ ...settings });
  });

  describe('앱 공개 상태', () => {
    it('앱이 공개되어 있으면 HTTP 200을 반환한다', async () => {
      const response = await request(createTestApp()).get('/app');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
      });

      expect(mockedSettings).toHaveBeenCalledOnce();
    });

    it('앱 비공개라면 503 APP_NOT_OPEN을 반환한다', async () => {
      mockedSettings.mockResolvedValue({
        ...settings,
        appOpen: false,
      });

      const response = await request(createTestApp()).get('/app');

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        code: 'APP_NOT_OPEN',
      });
    });
  });

  describe('행사 종료 후 충전 제한', () => {
    it('행사 종료 후에는 409 EVENT_ENDED를 반환한다', async () => {
      mockedSettings.mockResolvedValue({
        ...settings,
        eventStartDate: '2020-01-01',
        eventEndDate: '2020-01-02',
      });

      const response = await request(createTestApp()).get('/charge');

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'EVENT_ENDED',
      });
    });

    it('행사 시작 전에도 충전을 허용한다', async () => {
      mockedSettings.mockResolvedValue({
        ...settings,
        eventStartDate: '2099-01-01',
        eventEndDate: '2099-12-31',
      });

      const response = await request(createTestApp()).get('/charge');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
      });
    });

    it('기본 운영 시간 밖이어도 충전을 허용한다', async () => {
      mockedSettings.mockResolvedValue({
        ...settings,
        defaultOpenTime: '23:58:00',
        defaultCloseTime: '23:59:00',
      });

      const response = await request(createTestApp()).get('/charge');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
      });
    });
  });

  describe('DB 오류 처리', () => {
    it('DB 조회 중 오류가 발생하면 HTTP 500을 반환한다', async () => {
      mockedSettings.mockRejectedValue(new Error('DB 연결 실패'));

      const response = await request(createTestApp()).get('/app');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        code: 'INTERNAL',
      });
    });
  });
});
