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
 * SRV-12 요청 횟수 제한 미들웨어 테스트용 Express 앱
 */
function createTestApp() {
  const app = express();

  app.get(
    '/test',
    rateLimit({
      scope: 'test',
      limit: 3,
      windowSeconds: 60,
    }),
    (_req, res) => {
      res.status(200).json({ success: true });
    },
  );

  app.use(errorHandler);

  return app;
}

describe('SRV-12 Rate Limit Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('제한 이내 요청은 정상적으로 통과한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 2,
      retryAfterSeconds: 0,
    });

    const response = await request(createTestApp()).get('/test');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
    });

    expect(response.headers['ratelimit-limit']).toBe('3');
    expect(response.headers['ratelimit-remaining']).toBe('2');

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(expect.stringMatching(/^test:/), 3, 60);
  });

  it('제한 초과 시 HTTP 429를 반환한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 4,
      remaining: 0,
      retryAfterSeconds: 45,
    });

    const response = await request(createTestApp()).get('/test');

    expect(response.status).toBe(429);

    expect(response.body).toMatchObject({
      code: 'RATE_LIMITED',
    });

    expect(response.headers['retry-after']).toBe('45');
    expect(response.headers['ratelimit-remaining']).toBe('0');
  });

  it('Redis 오류가 발생하면 제한 없이 통과시키지 않는다', async () => {
    mockedCheckRateLimit.mockRejectedValue(new Error('Redis 연결 실패'));

    const response = await request(createTestApp()).get('/test');

    expect(response.status).toBe(500);

    expect(response.body).toMatchObject({
      code: 'INTERNAL',
    });

    expect(response.body).not.toMatchObject({
      success: true,
    });
  });

  it('요청 종류에 따라 서로 다른 키를 사용한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 2,
      retryAfterSeconds: 0,
    });

    const app = express();

    app.get(
      '/login',
      rateLimit({
        scope: 'login',
        limit: 3,
        windowSeconds: 60,
      }),
      (_req, res) => {
        res.sendStatus(200);
      },
    );

    app.get(
      '/menu',
      rateLimit({
        scope: 'menu',
        limit: 3,
        windowSeconds: 60,
      }),
      (_req, res) => {
        res.sendStatus(200);
      },
    );

    await request(app).get('/login');
    await request(app).get('/menu');

    const keys = mockedCheckRateLimit.mock.calls.map(([key]) => key);

    expect(keys[0]).toMatch(/^login:/);
    expect(keys[1]).toMatch(/^menu:/);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
