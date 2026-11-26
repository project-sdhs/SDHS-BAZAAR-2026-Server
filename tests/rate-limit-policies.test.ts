import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkRateLimit } from '../src/db/rate-limit.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import {
  createRateLimitMiddlewares,
  RATE_LIMIT_POLICIES,
} from '../src/middlewares/rate-limit-policies.js';

vi.mock('../src/db/rate-limit.js', () => ({
  checkRateLimit: vi.fn(),
}));

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

/**
 * 테스트에서만 인증된 사용자 ID를 주입한다.
 *
 * 실제 서버에서는 requireAppAuth를 사용해야 한다.
 */
const fakeAuth: express.RequestHandler = (req, res, next) => {
  res.locals.auth = {
    userId: Number(req.headers['x-test-user-id'] ?? 101),
  };

  next();
};

/**
 * 테스트에서만 부스 코드 검증을 흉내 낸다.
 *
 * 실제 메뉴판 연결 API에서는
 * DB 검증 이후에 verifiedBoardConnect를 설정해야 한다.
 */
const fakeBoardValidation: express.RequestHandler = (req, res, next) => {
  const boothCode = req.params.boothCode;

  if (typeof boothCode !== 'string' || !['ABC123', 'DEF456'].includes(boothCode)) {
    res.sendStatus(400);
    return;
  }

  res.locals.verifiedBoardConnect = {
    boothCode,
  };

  next();
};

function createTestApp() {
  const app = express();

  app.set('trust proxy', 'loopback');

  const limits = createRateLimitMiddlewares();

  app.post('/login', limits.login, (_req, res) => {
    res.sendStatus(200);
  });

  app.get('/qr', fakeAuth, limits.qr, (_req, res) => {
    res.sendStatus(200);
  });

  app.post('/payment', fakeAuth, limits.payment, (_req, res) => {
    res.sendStatus(200);
  });

  app.post('/charge', fakeAuth, limits.charge, (_req, res) => {
    res.sendStatus(200);
  });

  app.get('/menu/:boothCode', fakeBoardValidation, limits.menu, (_req, res) => {
    res.sendStatus(200);
  });

  app.use(errorHandler);

  return app;
}

function usedKeys(): string[] {
  return mockedCheckRateLimit.mock.calls.map(([key]) => key);
}

describe('SRV-12 공식 Rate Limit 정책', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 4,
      retryAfterSeconds: 0,
    });
  });

  it('공식 제한 횟수와 시간을 사용한다', () => {
    expect(RATE_LIMIT_POLICIES).toEqual({
      login: {
        limit: 300,
        windowSeconds: 60,
      },
      qr: {
        limit: 30,
        windowSeconds: 60,
      },
      payment: {
        limit: 10,
        windowSeconds: 60,
      },
      charge: {
        limit: 5,
        windowSeconds: 600,
      },
      menu: {
        limit: 5,
        windowSeconds: 600,
      },
    });
  });

  it('모든 기능에 공식 제한값을 전달한다', async () => {
    const app = createTestApp();

    await request(app).post('/login');
    await request(app).get('/qr');
    await request(app).post('/payment');
    await request(app).post('/charge');
    await request(app).get('/menu/ABC123');

    const calls = mockedCheckRateLimit.mock.calls;

    expect(calls).toHaveLength(5);

    expect(calls[0]?.slice(1)).toEqual([300, 60]);
    expect(calls[1]?.slice(1)).toEqual([30, 60]);
    expect(calls[2]?.slice(1)).toEqual([10, 60]);
    expect(calls[3]?.slice(1)).toEqual([5, 600]);
    expect(calls[4]?.slice(1)).toEqual([5, 600]);
  });

  it('QR, 결제, 충전은 사용자 ID를 기준으로 제한한다', async () => {
    const app = createTestApp();

    await request(app).get('/qr');
    await request(app).post('/payment');
    await request(app).post('/charge');

    expect(usedKeys()).toEqual(['qr:user:101', 'payment:user:101', 'charge:user:101']);
  });

  it('QR 조회는 사용자마다 다른 Redis 키를 사용한다', async () => {
    const app = createTestApp();

    await request(app).get('/qr').set('x-test-user-id', '101');

    await request(app).get('/qr').set('x-test-user-id', '202');

    expect(usedKeys()).toEqual(['qr:user:101', 'qr:user:202']);
  });

  it('메뉴판은 동일 IP라도 부스별로 키를 구분한다', async () => {
    const app = createTestApp();

    await request(app).get('/menu/ABC123').set('X-Forwarded-For', '203.0.113.10');

    await request(app).get('/menu/DEF456').set('X-Forwarded-For', '203.0.113.10');

    expect(usedKeys()).toEqual([
      'board-connect:ip:203.0.113.10:booth:ABC123',
      'board-connect:ip:203.0.113.10:booth:DEF456',
    ]);
  });

  it('메뉴판은 같은 부스라도 IP별로 키를 구분한다', async () => {
    const app = createTestApp();

    await request(app).get('/menu/ABC123').set('X-Forwarded-For', '203.0.113.10');

    await request(app).get('/menu/ABC123').set('X-Forwarded-For', '203.0.113.20');

    expect(usedKeys()).toEqual([
      'board-connect:ip:203.0.113.10:booth:ABC123',
      'board-connect:ip:203.0.113.20:booth:ABC123',
    ]);
  });

  it('검증되지 않은 부스 코드는 Redis 키로 사용하지 않는다', async () => {
    const response = await request(createTestApp()).get('/menu/INVALID');

    expect(response.status).toBe(400);
    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it('인증되지 않은 QR 조회는 HTTP 401을 반환한다', async () => {
    const app = express();

    const limits = createRateLimitMiddlewares();

    app.get('/qr', limits.qr, (_req, res) => {
      res.sendStatus(200);
    });

    app.use(errorHandler);

    const response = await request(app).get('/qr');

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: 'UNAUTHORIZED',
    });

    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it('제한 초과 시 HTTP 429 RATE_LIMITED를 반환한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 301,
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
