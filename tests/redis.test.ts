import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectRedis, disconnectRedis, getRedisClient, pingRedis } from '../src/db/redis.js';

// 실제 Redis 없이: 아무도 듣지 않는 포트로 연결해 봐요.
describe('connectRedis', () => {
  afterEach(async () => {
    await disconnectRedis();
    vi.unstubAllEnvs();
  });

  it('Redis에 붙을 수 없으면 기다리지 않고 에러로 끝난다 (서버가 켜지지 않게)', async () => {
    vi.stubEnv('DB_USER', 'bazaar');
    vi.stubEnv('DB_NAME', 'sdhs_bazaar');
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');

    const started = Date.now();

    await expect(connectRedis()).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
    await expect(pingRedis()).rejects.toThrow('준비되지 않았습니다');
  });

  it('실패한 클라이언트는 버리고 다음에는 새로 만든다', async () => {
    vi.stubEnv('DB_USER', 'bazaar');
    vi.stubEnv('DB_NAME', 'sdhs_bazaar');
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');

    const first = getRedisClient();
    await expect(connectRedis()).rejects.toThrow();

    expect(getRedisClient()).not.toBe(first);
  });
});
