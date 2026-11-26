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
 * SRV-12: 클라이언트 IP 식별 테스트
 *
 * Express가 신뢰하는 프록시는 loopback으로 제한한다.
 * X-Forwarded-For를 직접 파싱하지 않는다.
 */
function createTestApp() {
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
      res.status(200).json({ success: true });
    },
  );

  app.use(errorHandler);

  return app;
}

function usedKeys(): string[] {
  return mockedCheckRateLimit.mock.calls.map(([key]) => key);
}

describe('SRV-12 클라이언트 IP 제한 키', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 299,
      retryAfterSeconds: 0,
    });
  });

  it('클라이언트 IP를 Redis 키에 정확히 사용한다', async () => {
    const response = await request(createTestApp())
      .get('/login')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(200);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith('login:203.0.113.10', 300, 60);
  });

  it('서로 다른 IP는 다른 Redis 키를 사용한다', async () => {
    const app = createTestApp();

    const response1 = await request(app).get('/login').set('X-Forwarded-For', '203.0.113.10');

    const response2 = await request(app).get('/login').set('X-Forwarded-For', '203.0.113.20');

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    expect(usedKeys()).toEqual(['login:203.0.113.10', 'login:203.0.113.20']);
  });

  it('동일한 IP는 동일한 Redis 키를 사용한다', async () => {
    const app = createTestApp();

    await request(app).get('/login').set('X-Forwarded-For', '203.0.113.10');

    await request(app).get('/login').set('X-Forwarded-For', '203.0.113.10');

    expect(usedKeys()).toEqual(['login:203.0.113.10', 'login:203.0.113.10']);
  });

  it('신뢰되지 않은 중간 프록시 앞의 주소는 사용하지 않는다', async () => {
    const response = await request(createTestApp())
      .get('/login')
      .set('X-Forwarded-For', '192.0.2.100, 198.51.100.40');

    expect(response.status).toBe(200);

    // 198.51.100.40은 신뢰된 프록시가 아니다.
    // 따라서 그보다 왼쪽에 있는 주소를 사용하지 않는다.
    expect(usedKeys()).toEqual(['login:198.51.100.40']);
  });

  it('공식 로그인 제한인 300회/60초를 사용한다', async () => {
    await request(createTestApp()).get('/login').set('X-Forwarded-For', '203.0.113.30');

    expect(mockedCheckRateLimit).toHaveBeenCalledWith('login:203.0.113.30', 300, 60);
  });

  it('Redis 오류가 발생하면 HTTP 500을 반환한다', async () => {
    mockedCheckRateLimit.mockRejectedValue(new Error('Redis 연결 실패'));

    const response = await request(createTestApp())
      .get('/login')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(500);

    expect(response.body).toMatchObject({
      code: 'INTERNAL',
    });
  });
});
