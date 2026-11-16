import { createClient } from 'redis';
import { loadEnv } from '../config/env.js';

// Redis 클라이언트 생성
const env = loadEnv();

export const redisClient = createClient({
  url: env.REDIS_URL,
});

// Redis 오류 처리
redisClient.on('error', (error) => {
  console.error('Redis 오류:', error);
});

// Redis 연결 함수
export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  console.log('Redis 연결 성공!');
}

// Redis 연결 종료 함수
export async function disconnectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
}
