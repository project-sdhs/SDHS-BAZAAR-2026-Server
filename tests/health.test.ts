import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('200과 상태 정보를 돌려준다', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      status: 'ok',
      uptime: expect.any(Number) as number,
      timestamp: expect.any(String) as string,
    });
  });

  it('uptime은 0 이상의 정수(초), timestamp는 ISO 8601 시각이다', async () => {
    const res = await request(createApp()).get('/health');
    const body = res.body as { uptime: number; timestamp: string };

    expect(Number.isInteger(body.uptime)).toBe(true);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

describe('없는 경로', () => {
  it('404와 { code, message } 를 돌려준다', async () => {
    const res = await request(createApp()).get('/no-such-path');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String) as string,
    });
  });
});
