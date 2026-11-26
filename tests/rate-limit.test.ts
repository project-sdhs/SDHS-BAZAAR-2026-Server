import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkRateLimit } from '../src/db/rate-limit.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { rateLimit } from '../src/middlewares/rate-limit.js';

vi.mock('../src/db/rate-limit.js', () => ({
  checkRateLimit: vi.fn(),
}));

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

/**
 * SRV-12: 공통 요청 횟수 제한 미들웨어 테스트
 */
function createTestApp() {
  const app = express();

  app.set('trust proxy', 'loopback');

  app.get(
    '/test',
    rateLimit({
      scope: 'test',
      limit: 3,
      windowSeconds: 60,
    }),
    (_req, res) => {
      res.status(200).json({
        success: true,
      });
    },
  );

  app.use(errorHandler);

  return app;
}

function usedKeys(): string[] {
  return mockedCheckRateLimit.mock.calls.map(([key]) => key);
}

describe('SRV-12 Rate Limit Middleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 2,
      retryAfterSeconds: 0,
    });
  });

  it('제한 이내 요청은 정상적으로 통과한다', async () => {
    const response = await request(createTestApp())
      .get('/test')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      success: true,
    });

    expect(mockedCheckRateLimit).toHaveBeenCalledWith('test:203.0.113.10', 3, 60);

    // API 문서에 없는 헤더를 반환하지 않는다.
    expect(response.headers['ratelimit-limit']).toBeUndefined();
    expect(response.headers['ratelimit-remaining']).toBeUndefined();
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('제한 초과 시 HTTP 429 RATE_LIMITED를 반환한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 4,
      remaining: 0,
      retryAfterSeconds: 45,
    });

    const response = await request(createTestApp())
      .get('/test')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(429);

    expect(response.body).toMatchObject({
      code: 'RATE_LIMITED',
    });

    expect(response.headers['retry-after']).toBe('45');
    expect(response.headers['ratelimit-limit']).toBeUndefined();
    expect(response.headers['ratelimit-remaining']).toBeUndefined();
  });

  it('남은 시간이 0초여도 Retry-After는 최소 1초다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 4,
      remaining: 0,
      retryAfterSeconds: 0,
    });

    const response = await request(createTestApp()).get('/test');

    expect(response.status).toBe(429);

    expect(response.body).toMatchObject({
      code: 'RATE_LIMITED',
    });

    expect(response.headers['retry-after']).toBe('1');
  });

  it('남은 시간이 소수라면 올림한 정수를 사용한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 4,
      remaining: 0,
      retryAfterSeconds: 1.2,
    });

    const response = await request(createTestApp()).get('/test');

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('2');
  });

  it('Redis 오류가 발생하면 HTTP 500을 반환한다', async () => {
    mockedCheckRateLimit.mockRejectedValue(new Error('Redis 연결 실패'));

    const response = await request(createTestApp()).get('/test');

    expect(response.status).toBe(500);

    expect(response.body).toMatchObject({
      code: 'INTERNAL',
    });

    expect(response.body).not.toMatchObject({
      success: true,
    });

    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('서로 다른 scope는 서로 다른 Redis 키를 사용한다', async () => {
    const app = express();

    app.set('trust proxy', 'loopback');

    app.get(
      '/login',
      rateLimit({
        scope: 'login',
        limit: 300,
        windowSeconds: 60,
      }),
      (_req, res) => {
        res.sendStatus(200);
      },
    );

    app.get(
      '/qr-test',
      rateLimit({
        scope: 'qr-test',
        limit: 30,
        windowSeconds: 60,
      }),
      (_req, res) => {
        res.sendStatus(200);
      },
    );

    app.use(errorHandler);

    await request(app).get('/login').set('X-Forwarded-For', '203.0.113.10');

    await request(app).get('/qr-test').set('X-Forwarded-For', '203.0.113.10');

    expect(usedKeys()).toEqual(['login:203.0.113.10', 'qr-test:203.0.113.10']);
  });

  it('서로 다른 IP는 서로 다른 Redis 키를 사용한다', async () => {
    const app = createTestApp();

    await request(app).get('/test').set('X-Forwarded-For', '203.0.113.10');

    await request(app).get('/test').set('X-Forwarded-For', '203.0.113.20');

    expect(usedKeys()).toEqual(['test:203.0.113.10', 'test:203.0.113.20']);
  });
});
