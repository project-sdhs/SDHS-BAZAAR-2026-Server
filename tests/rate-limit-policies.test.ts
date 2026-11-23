import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkRateLimit } from '../src/db/rate-limit.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { createRateLimitMiddlewares } from '../src/middlewares/rate-limit-policies.js';

vi.mock('../src/db/rate-limit.js', () => ({
  checkRateLimit: vi.fn(),
}));

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

const policies = {
  // 실제 운영 정책값이 아닌 테스트 전용 값
  login: { limit: 3, windowSeconds: 60 },
  qr: { limit: 10, windowSeconds: 60 },
  payment: { limit: 5, windowSeconds: 60 },
  charge: { limit: 4, windowSeconds: 60 },
  menu: { limit: 20, windowSeconds: 60 },
};

function createTestApp() {
  const app = express();
  const limits = createRateLimitMiddlewares(policies);

  // 테스트에서만 사용자 ID를 주입한다.
  // 실제 API에서는 requireAppAuth를 사용해야 한다.
  const fakeAuth: express.RequestHandler = (_req, res, next) => {
    res.locals.auth = { userId: 101 };
    next();
  };

  app.post('/login', limits.login, (_req, res) => {
    res.sendStatus(200);
  });

  app.get('/qr', limits.qr, (_req, res) => {
    res.sendStatus(200);
  });

  app.post('/payment', fakeAuth, limits.payment, (_req, res) => {
    res.sendStatus(200);
  });

  app.post('/charge', fakeAuth, limits.charge, (_req, res) => {
    res.sendStatus(200);
  });

  app.get('/menu', limits.menu, (_req, res) => {
    res.sendStatus(200);
  });

  app.use(errorHandler);

  return app;
}

describe('SRV-12 Rate Limit Policies', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 2,
      retryAfterSeconds: 0,
    });
  });

  it('기능별로 서로 다른 제한 키를 사용한다', async () => {
    const app = createTestApp();

    expect((await request(app).post('/login')).status).toBe(200);
    expect((await request(app).get('/qr')).status).toBe(200);
    expect((await request(app).post('/payment')).status).toBe(200);
    expect((await request(app).post('/charge')).status).toBe(200);
    expect((await request(app).get('/menu')).status).toBe(200);

    const keys = mockedCheckRateLimit.mock.calls.map(([key]) => key);

    expect(keys[0]).toMatch(/^login:/);
    expect(keys[1]).toMatch(/^qr:/);
    expect(keys[2]).toBe('payment:user:101');
    expect(keys[3]).toBe('charge:user:101');
    expect(keys[4]).toMatch(/^menu:/);

    expect(new Set(keys).size).toBe(5);
  });

  it('기능별 제한 횟수와 시간이 올바르게 전달된다', async () => {
    const app = createTestApp();

    await request(app).post('/login');
    await request(app).get('/qr');
    await request(app).post('/payment');
    await request(app).post('/charge');
    await request(app).get('/menu');

    expect(mockedCheckRateLimit).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^login:/),
      3,
      60,
    );

    expect(mockedCheckRateLimit).toHaveBeenNthCalledWith(2, expect.stringMatching(/^qr:/), 10, 60);

    expect(mockedCheckRateLimit).toHaveBeenNthCalledWith(3, 'payment:user:101', 5, 60);

    expect(mockedCheckRateLimit).toHaveBeenNthCalledWith(4, 'charge:user:101', 4, 60);

    expect(mockedCheckRateLimit).toHaveBeenNthCalledWith(
      5,
      expect.stringMatching(/^menu:/),
      20,
      60,
    );
  });

  it('기능별 제한 초과 시 HTTP 429를 반환한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 4,
      remaining: 0,
      retryAfterSeconds: 30,
    });

    const response = await request(createTestApp()).post('/login');

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(response.headers['retry-after']).toBe('30');
  });
});
