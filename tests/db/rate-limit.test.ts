import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectRedis, disconnectRedis, getRedisClient } from '../../src/db/redis.js';

import { checkRateLimit } from '../../src/db/rate-limit.js';

describe('DB-02 Redis Rate Limit', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it('3회까지 요청을 허용하고 4회부터 차단한다', async () => {
    const key = `test:${randomUUID()}`;

    try {
      const first = await checkRateLimit(key, 3, 30);
      const second = await checkRateLimit(key, 3, 30);
      const third = await checkRateLimit(key, 3, 30);
      const fourth = await checkRateLimit(key, 3, 30);

      expect(first.allowed).toBe(true);
      expect(first.count).toBe(1);
      expect(first.remaining).toBe(2);

      expect(second.allowed).toBe(true);
      expect(second.count).toBe(2);
      expect(second.remaining).toBe(1);

      expect(third.allowed).toBe(true);
      expect(third.count).toBe(3);
      expect(third.remaining).toBe(0);

      expect(fourth.allowed).toBe(false);
      expect(fourth.count).toBe(4);
      expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      await getRedisClient().del(`bazaar:rate-limit:${key}`);
    }
  });

  it('TTL 만료 후 요청 횟수가 초기화된다', async () => {
    const key = `test:${randomUUID()}`;

    try {
      const first = await checkRateLimit(key, 1, 1);
      const second = await checkRateLimit(key, 1, 1);

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(false);

      await new Promise((resolve) => {
        setTimeout(resolve, 1200);
      });

      const afterExpiry = await checkRateLimit(key, 1, 1);

      expect(afterExpiry.allowed).toBe(true);
      expect(afterExpiry.count).toBe(1);
    } finally {
      await getRedisClient().del(`bazaar:rate-limit:${key}`);
    }
  });

  it('빈 키는 거부한다', async () => {
    await expect(checkRateLimit('', 3, 60)).rejects.toThrow('Rate Limit 키가 비어 있습니다.');
  });

  it('잘못된 요청 제한 횟수는 거부한다', async () => {
    await expect(checkRateLimit('test', 0, 60)).rejects.toThrow(
      '요청 제한 횟수는 양의 정수여야 합니다.',
    );
  });

  it('잘못된 제한 시간은 거부한다', async () => {
    await expect(checkRateLimit('test', 3, 0)).rejects.toThrow('제한 시간은 양의 정수여야 합니다.');
  });
});
