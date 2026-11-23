import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';

// 실제 DB와 Redis에 연결하지 않고 테스트
const { pingDb, pingRedis } = vi.hoisted(() => ({
  pingDb: vi.fn<() => Promise<void>>(),
  pingRedis: vi.fn<() => Promise<void>>(),
}));

vi.mock('../src/db/pool.js', () => ({
  pingDb,
}));

vi.mock('../src/db/redis.js', () => ({
  pingRedis,
}));

type Check = 'ok' | 'error';

interface HealthResponse {
  status: Check;
  db: Check;
  redis: Check;
  time: string;
}

interface ErrorResponse {
  code: string;
  message: string;
  requestId: string;
}

describe('GET /health', () => {
  beforeEach(() => {
    pingDb.mockReset();
    pingRedis.mockReset();

    pingDb.mockResolvedValue(undefined);
    pingRedis.mockResolvedValue(undefined);
  });

  it('DB와 Redis가 모두 정상이면 200을 반환한다', async () => {
    const res = await request(createApp()).get('/health');
    const body = res.body as HealthResponse;

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);

    expect(body).toEqual({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      time: expect.any(String) as string,
    });
  });

  it('DB 연결이 실패하면 503을 반환한다', async () => {
    pingDb.mockRejectedValue(new Error('DB 연결 실패'));

    const res = await request(createApp()).get('/health');
    const body = res.body as HealthResponse;

    expect(res.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.db).toBe('error');
    expect(body.redis).toBe('ok');
  });

  it('Redis 연결이 실패하면 503을 반환한다', async () => {
    pingRedis.mockRejectedValue(new Error('Redis 연결 실패'));

    const res = await request(createApp()).get('/health');
    const body = res.body as HealthResponse;

    expect(res.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.db).toBe('ok');
    expect(body.redis).toBe('error');
  });

  it('DB와 Redis가 모두 실패하면 503을 반환한다', async () => {
    pingDb.mockRejectedValue(new Error('DB 연결 실패'));
    pingRedis.mockRejectedValue(new Error('Redis 연결 실패'));

    const res = await request(createApp()).get('/health');
    const body = res.body as HealthResponse;

    expect(res.status).toBe(503);
    expect(body.db).toBe('error');
    expect(body.redis).toBe('error');
  });

  it('응답 시각은 UTC ISO 8601 형식이다', async () => {
    const res = await request(createApp()).get('/health');
    const body = res.body as HealthResponse;

    expect(new Date(body.time).toISOString()).toBe(body.time);
  });
});

describe('없는 경로', () => {
  it('404와 NOT_FOUND를 반환한다', async () => {
    const res = await request(createApp()).get('/no-such-path');
    const body = res.body as ErrorResponse;

    expect(res.status).toBe(404);
    expect(body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String) as string,
      requestId: expect.any(String) as string,
    });
  });
});
