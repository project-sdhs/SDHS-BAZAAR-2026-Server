import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectRedis, disconnectRedis, getRedisClient } from '../../src/db/redis.js';

import { setCache, getCache, deleteCache } from '../../src/db/cache.js';

describe('DB-02 Redis Cache', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it('데이터를 저장하고 조회할 수 있다', async () => {
    const key = `test:${randomUUID()}`;

    try {
      const data = {
        boothId: 1,
        name: '테스트 부스',
        isOpen: true,
      };

      await setCache(key, data, 30);

      const result = await getCache<typeof data>(key);

      expect(result).toEqual(data);
    } finally {
      await deleteCache(key);
    }
  });

  it('존재하지 않는 키는 null을 반환한다', async () => {
    const key = `test:${randomUUID()}`;

    const result = await getCache(key);

    expect(result).toBeNull();
  });

  it('저장된 캐시를 삭제할 수 있다', async () => {
    const key = `test:${randomUUID()}`;

    await setCache(key, { value: 100 }, 30);

    const deleted = await deleteCache(key);
    const result = await getCache(key);

    expect(deleted).toBe(true);
    expect(result).toBeNull();
  });

  it('TTL이 만료되면 캐시가 사라진다', async () => {
    const key = `test:${randomUUID()}`;

    try {
      await setCache(key, { value: 'temporary' }, 1);

      expect(await getCache(key)).not.toBeNull();

      await new Promise((resolve) => {
        setTimeout(resolve, 1200);
      });

      expect(await getCache(key)).toBeNull();
    } finally {
      await deleteCache(key);
    }
  });

  it('빈 캐시 키는 거부한다', async () => {
    await expect(setCache('', 'value')).rejects.toThrow('캐시 키가 비어 있습니다.');
  });

  it('잘못된 TTL은 거부한다', async () => {
    await expect(setCache('test', 'value', 0)).rejects.toThrow('TTL은 양의 정수여야 합니다.');
  });

  it('캐시 키가 지정한 TTL과 함께 저장된다', async () => {
    const key = `test:${randomUUID()}`;

    try {
      await setCache(key, 'value', 30);

      const ttl = await getRedisClient().ttl(`bazaar:cache:${key}`);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    } finally {
      await deleteCache(key);
    }
  });
});
