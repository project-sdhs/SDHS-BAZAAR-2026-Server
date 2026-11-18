
import { createClient } from 'redis';

import { loadEnv } from '../config/env.js';

// Redis 클라이언트는 실제 사용 시점에 생성
let redisClient: ReturnType<typeof createClient> | undefined;

export function getRedisClient(): ReturnType<typeof createClient> {
  if (!redisClient) {
    const env = loadEnv();

    redisClient = createClient({
      url: env.REDIS_URL,
    });

    redisClient.on('error', (error) => {
      console.error('Redis 오류:', error);
    });
  }

  return redisClient;
}

// Redis 연결
export async function connectRedis(): Promise<void> {
  const client = getRedisClient();

  if (!client.isOpen) {
    await client.connect();
  }

  console.log('Redis 연결 성공!');
}

// Redis 연결 종료
export async function disconnectRedis(): Promise<void> {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
}

// Redis 상태 확인
export async function pingRedis(): Promise<void> {
  if (!redisClient?.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const response = await redisClient.ping();

  if (response !== 'PONG') {
    throw new Error('Redis PING 응답이 올바르지 않습니다.');
  }
}
