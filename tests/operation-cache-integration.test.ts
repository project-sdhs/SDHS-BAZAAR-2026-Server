import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../src/middlewares/error-handler.js';
import { requireAppOpen, requireEventPeriod } from '../src/middlewares/operation-guard.js';

import type { PublicSettingsData } from '../src/models/public-settings.model.js';
import { PUBLIC_SETTINGS_CACHE_KEY } from '../src/services/public-settings.service.js';

// 실제 서비스 로직은 사용하고 외부 저장소만 Mock 처리한다.
const fakeCache = vi.hoisted(() => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
}));

const fakeRepository = vi.hoisted(() => ({
  findPublicSettings: vi.fn(),
}));

vi.mock('../src/db/cache.js', () => fakeCache);

vi.mock('../src/repositories/public-settings.repository.js', () => fakeRepository);

const settings: PublicSettingsData = {
  appOpen: true,
  eventName: '테스트 바자회',
  eventStartDate: '2099-01-01',
  eventEndDate: '2099-12-31',
  depositAccount: null,
  depositorNameRule: '{studentNo} {name}',
  depositorNameRuleWithCode: '{depositCode} {name}',
  chargeMin: 1000,
  chargeMax: null,
  balanceLimit: null,
};

function createTestApp() {
  const app = express();

  app.get('/app', requireAppOpen, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.post('/charge', requireAppOpen, requireEventPeriod, (_req, res) => {
    res.status(200).json({ success: true });
  });

  app.use(errorHandler);

  return app;
}

describe('SRV-13 + SRV-20 캐시 통합 테스트', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // 기본값: 캐시 MISS -> DB 조회
    fakeCache.getCache.mockResolvedValue(null);
    fakeCache.setCache.mockResolvedValue(undefined);
    fakeRepository.findPublicSettings.mockResolvedValue({
      ...settings,
    });
  });

  it('캐시 MISS 시 DB 조회 후 10초 캐시에 저장한다', async () => {
    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(200);

    expect(fakeCache.getCache).toHaveBeenCalledWith(PUBLIC_SETTINGS_CACHE_KEY);

    expect(fakeRepository.findPublicSettings).toHaveBeenCalledOnce();

    expect(fakeCache.setCache).toHaveBeenCalledWith(
      PUBLIC_SETTINGS_CACHE_KEY,
      expect.objectContaining({
        appOpen: true,
        eventName: '테스트 바자회',
      }),
      10,
    );
  });

  it('캐시 HIT 시 DB를 조회하지 않는다', async () => {
    fakeCache.getCache.mockResolvedValue({
      ...settings,
      depositorNameExample: '2205 이재원',
      depositorNameExampleWithCode: 'V3071 김하린',
    });

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(200);

    expect(fakeRepository.findPublicSettings).not.toHaveBeenCalled();
    expect(fakeCache.setCache).not.toHaveBeenCalled();
  });

  it('캐시에 앱 비공개 상태가 있으면 HTTP 503을 반환한다', async () => {
    fakeCache.getCache.mockResolvedValue({
      ...settings,
      appOpen: false,
    });

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(503);

    expect(response.body).toMatchObject({
      code: 'APP_NOT_OPEN',
    });

    expect(fakeRepository.findPublicSettings).not.toHaveBeenCalled();
  });

  it('캐시에 행사 종료 상태가 있으면 충전을 차단한다', async () => {
    fakeCache.getCache.mockResolvedValue({
      ...settings,
      eventEndDate: '2020-01-01',
    });

    const response = await request(createTestApp()).post('/charge');

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: 'EVENT_ENDED',
    });

    expect(fakeRepository.findPublicSettings).not.toHaveBeenCalled();
  });

  it('Redis 조회 실패 시 DB 설정으로 정상 동작한다', async () => {
    fakeCache.getCache.mockRejectedValue(new Error('Redis 연결 실패'));

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(200);

    expect(fakeRepository.findPublicSettings).toHaveBeenCalledOnce();
  });

  it('Redis 저장 실패 시에도 정상 응답한다', async () => {
    fakeCache.setCache.mockRejectedValue(new Error('Redis 저장 실패'));

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(200);

    expect(fakeRepository.findPublicSettings).toHaveBeenCalledOnce();
  });

  it('DB 조회 실패 시 HTTP 500을 반환한다', async () => {
    fakeRepository.findPublicSettings.mockRejectedValue(new Error('MySQL 연결 실패'));

    const response = await request(createTestApp()).get('/app');

    expect(response.status).toBe(500);

    expect(response.body).toMatchObject({
      code: 'INTERNAL',
    });

    expect(fakeCache.setCache).not.toHaveBeenCalled();
  });
});
