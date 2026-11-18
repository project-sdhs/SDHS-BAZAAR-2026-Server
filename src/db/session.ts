
import { createHash, randomBytes } from 'node:crypto';

import { getRedisClient } from './redis.js';

const SESSION_PREFIX = 'bazaar:session:';
const DEFAULT_TTL_SECONDS = 60 * 60;

export interface SessionData {
  userId: string;
  createdAt: string;
}

function validateTtl(ttlSeconds: number): void {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('세션 TTL은 양의 정수여야 합니다.');
  }
}

function sessionKey(token: string): string {
  if (!token.trim()) {
    throw new Error('세션 토큰이 비어 있습니다.');
  }

  // 원본 토큰 대신 SHA-256 해시를 Redis 키에 사용
  const hash = createHash('sha256')
    .update(token)
    .digest('hex');

  return `${SESSION_PREFIX}${hash}`;
}

function readyRedis() {
  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  return redis;
}

// 세션 생성
export async function createSession(
  userId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  if (!userId.trim()) {
    throw new Error('사용자 ID가 비어 있습니다.');
  }

  validateTtl(ttlSeconds);

  const redis = readyRedis();

  // 예측하기 어려운 무작위 세션 토큰 생성
  const token = randomBytes(32).toString('hex');

  const session: SessionData = {
    userId,
    createdAt: new Date().toISOString(),
  };

  await redis.set(
    sessionKey(token),
    JSON.stringify(session),
    {
      EX: ttlSeconds,
      NX: true,
    },
  );

  return token;
}

// 세션 조회
export async function getSession(
  token: string,
): Promise<SessionData | null> {
  const redis = readyRedis();

  const value = await redis.get(sessionKey(token));

  if (value === null) {
    return null;
  }

  return JSON.parse(value) as SessionData;
}

// 세션 삭제 (로그아웃 등)
export async function deleteSession(
  token: string,
): Promise<boolean> {
  const redis = readyRedis();

  const deleted = await redis.del(sessionKey(token));

  return deleted > 0;
}

// 세션 만료 시간 갱신
export async function refreshSession(
  token: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<boolean> {
  validateTtl(ttlSeconds);

  const redis = readyRedis();

  const updated = await redis.expire(
    sessionKey(token),
    ttlSeconds,
  );

  
return updated === 1;

}
