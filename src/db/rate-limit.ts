import { getRedisClient } from './redis.js';

const KEY_PREFIX = 'bazaar:rate-limit:';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!key.trim()) {
    throw new Error('Rate Limit 키가 비어 있습니다.');
  }

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('요청 제한 횟수는 양의 정수여야 합니다.');
  }

  if (!Number.isSafeInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error('제한 시간은 양의 정수여야 합니다.');
  }

  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const redisKey = `${KEY_PREFIX}${key}`;

  // Redis Lua 스크립트로 횟수 증가와 TTL을 원자적으로 처리
  const result = await redis.eval(
    `
    local count = redis.call('INCR', KEYS[1])

    if count == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end

    local ttl = redis.call('TTL', KEYS[1])
    return {count, ttl}
    `,
    {
      keys: [redisKey],
      arguments: [String(windowSeconds)],
    },
  );

  if (!Array.isArray(result)) {
    throw new Error('Redis 응답 형식이 올바르지 않습니다.');
  }

  const count = Number(result[0]);
  const ttl = Number(result[1]);

  if (!Number.isSafeInteger(count) || ttl < 0) {
    throw new Error('Redis 횟수 제한 결과가 올바르지 않습니다.');
  }

  return {
    allowed: count <= limit,
    count,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: count > limit ? ttl : 0,
  };
}
