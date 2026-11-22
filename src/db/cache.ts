import { getRedisClient } from './redis.js';

const CACHE_PREFIX = 'bazaar:cache:';
const DEFAULT_TTL_SECONDS = 300;

function validateKey(key: string): void {
  if (!key.trim()) {
    throw new Error('캐시 키가 비어 있습니다.');
  }
}

function validateTtl(ttlSeconds: number): void {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('TTL은 양의 정수여야 합니다.');
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  validateKey(key);
  validateTtl(ttlSeconds);

  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error('JSON으로 저장할 수 없는 값입니다.');
  }

  await redis.set(`${CACHE_PREFIX}${key}`, serialized, { EX: ttlSeconds });
}

export async function getCache<T>(key: string): Promise<T | null> {
  validateKey(key);

  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const value = await redis.get(`${CACHE_PREFIX}${key}`);

  if (value === null) {
    return null;
  }

  return JSON.parse(value) as T;
}

export async function deleteCache(key: string): Promise<boolean> {
  validateKey(key);

  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const deleted = await redis.del(`${CACHE_PREFIX}${key}`);

  return deleted > 0;
}
