import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';

const { pingDb, pingRedis } = vi.hoisted(() => ({
  pingDb: vi.fn<() => Promise<void>>(),
  pingRedis: vi.fn<() => Promise<void>>(),
}));

vi.mock('../src/db/pool.js', () => ({ pingDb }));
vi.mock('../src/db/redis.js', () => ({ pingRedis }));

const app = () =>
  createApp({
    corsAllowedOrigins: ['https://admin.example.com', 'https://board.example.com'],
  });

describe('CORS', () => {
  beforeEach(() => {
    pingDb.mockResolvedValue(undefined);
    pingRedis.mockResolvedValue(undefined);
  });

  it('허용 origin의 preflight에 허용 메서드와 요청 헤더를 돌려준다', async () => {
    const response = await request(app())
      .options('/app-versions')
      .set('Origin', 'https://admin.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,idempotency-key');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://admin.example.com');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('허용 origin에서 X-Request-Id와 Retry-After 응답 헤더를 읽을 수 있다', async () => {
    const response = await request(app()).get('/health').set('Origin', 'https://board.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://board.example.com');
    expect(response.headers['access-control-expose-headers']).toBe('X-Request-Id,Retry-After');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('허용되지 않은 origin에는 CORS 허용 헤더를 보내지 않는다', async () => {
    const response = await request(app())
      .get('/health')
      .set('Origin', 'https://untrusted.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
