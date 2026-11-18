
import { getRedisClient } from './redis.js';

const KEY_PREFIX = 'bazaar:request:';
const DEFAULT_TTL_SECONDS = 60;

/**
 * 요청 키를 Redis에 등록합니다.
 *
 * true: 처음 등록된 요청
 * false: 이미 등록된 요청
 *
 * Redis SET NX EX를 사용해
 * 중복 확인과 저장을 원자적으로 처리합니다.
 */
export async function reserveRequestKey(
  requestKey: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<boolean> {
  if (!requestKey.trim()) {
    throw new Error('요청 키가 비어 있습니다.');
  }

  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('TTL은 양의 정수여야 합니다.');
  }

  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const key = `${KEY_PREFIX}${requestKey}`;

  const result = await redis.set(key, '1', {
    NX: true,
    EX: ttlSeconds,
  });

  return result === 'OK';
}

/**
 * 요청 키가 Redis에 존재하는지 확인합니다.
 */
export async function hasRequestKey(
  requestKey: string,
): Promise<boolean> {
  if (!requestKey.trim()) {
    throw new Error('요청 키가 비어 있습니다.');
  }

  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const key = `${KEY_PREFIX}${requestKey}`;

  return (await redis.exists(key)) === 1;
}
