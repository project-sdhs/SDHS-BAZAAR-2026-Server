import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';

// CI의 기본 테스트에는 DB가 없어서, DB 확인(pingDb)만 가짜로 바꿔요.
const pingDb = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock(import('../src/db/pool.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  pingDb,
}));

describe('GET /health', () => {
  beforeEach(() => {
    pingDb.mockReset();
  });

  it('DB가 정상이면 200과 { status, db, time } 을 돌려준다', async () => {
    pingDb.mockResolvedValue();

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok', db: 'ok', time: expect.any(String) as string });
  });

  it('time 은 ISO 8601(UTC) 시각이다', async () => {
    pingDb.mockResolvedValue();

    const res = await request(createApp()).get('/health');
    const { time } = res.body as { time: string };

    expect(new Date(time).toISOString()).toBe(time);
  });

  it('DB에 연결할 수 없으면 503과 db: error 를 돌려준다', async () => {
    pingDb.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'error', time: expect.any(String) as string });
  });
});

describe('없는 경로', () => {
  it('404와 { code, message } 를 돌려준다', async () => {
    const res = await request(createApp()).get('/no-such-path');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String) as string,
      requestId: expect.any(String) as string,
    });
  });
});
