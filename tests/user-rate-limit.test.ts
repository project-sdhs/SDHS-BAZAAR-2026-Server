import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkRateLimit } from '../src/db/rate-limit.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { userRateLimit } from '../src/middlewares/user-rate-limit.js';

vi.mock('../src/db/rate-limit.js', () => ({
  checkRateLimit: vi.fn(),
}));

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

/**
 * 테스트용 인증 미들웨어.
 * 실제 서비스에서는 requireAppAuth가 사용자 ID를 설정한다.
 */
function createTestApp() {
  const app = express();

  app.post(
    '/payment',
    (req, res, next) => {
      const userId = req.get('x-test-user-id');

      if (userId) {
        res.locals.auth = {
          userId: Number(userId),
        };
      }

      next();
    },
    userRateLimit({
      scope: 'payment',
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

describe('SRV-12 User Rate Limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('인증된 사용자의 요청은 정상적으로 통과한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 2,
      retryAfterSeconds: 0,
    });

    const response = await request(createTestApp()).post('/payment').set('x-test-user-id', '101');

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      success: true,
    });

    expect(mockedCheckRateLimit).toHaveBeenCalledWith('payment:user:101', 3, 60);
  });

  it('사용자마다 서로 다른 제한 키를 사용한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 2,
      retryAfterSeconds: 0,
    });

    const app = createTestApp();

    await request(app).post('/payment').set('x-test-user-id', '101');

    await request(app).post('/payment').set('x-test-user-id', '202');

    expect(mockedCheckRateLimit).toHaveBeenNthCalledWith(1, 'payment:user:101', 3, 60);

    expect(mockedCheckRateLimit).toHaveBeenNthCalledWith(2, 'payment:user:202', 3, 60);
  });

  it('인증 정보가 없으면 HTTP 401을 반환한다', async () => {
    const response = await request(createTestApp()).post('/payment');

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: 'UNAUTHORIZED',
    });

    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
  });

  it('사용자 요청 횟수 초과 시 HTTP 429를 반환한다', async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      count: 4,
      remaining: 0,
      retryAfterSeconds: 30,
    });

    const response = await request(createTestApp()).post('/payment').set('x-test-user-id', '101');

    expect(response.status).toBe(429);

    expect(response.body).toMatchObject({
      code: 'RATE_LIMITED',
    });

    expect(response.headers['retry-after']).toBe('30');
  });

  it('Redis 연결 실패 시 요청을 통과시키지 않는다', async () => {
    mockedCheckRateLimit.mockRejectedValue(new Error('Redis 연결 실패'));

    const response = await request(createTestApp()).post('/payment').set('x-test-user-id', '101');

    expect(response.status).toBe(500);

    expect(response.body).toMatchObject({
      code: 'INTERNAL',
    });
  });
});
