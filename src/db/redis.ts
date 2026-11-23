import { createClient } from 'redis';

import { loadEnv } from '../config/env.js';
import { logger } from '../config/logger.js';

/** 처음 연결할 때 이 시간 안에 붙지 않으면 포기해요. */
const CONNECT_TIMEOUT_MS = 5_000;
/** 연결된 뒤 끊겼을 때 다시 붙기 전에 기다리는 최대 시간 */
const MAX_RECONNECT_DELAY_MS = 3_000;

/**
 * .env 의 REDIS_URL 로 클라이언트를 만들어요. (연결은 아직 안 해요)
 * - 처음 연결이 실패하면 다시 시도하지 않고 connect() 가 에러로 끝나요. → 서버가 켜지지 않아요.
 * - 한 번 연결된 뒤 끊기면 계속 다시 붙어요. 그동안 /health 는 503 이고, 로그는 끊길 때 · 다시 붙을 때 한 번씩만 남겨요.
 */
function createRedisClient() {
  let wasReady = false;
  let down = false;

  const client = createClient({
    url: loadEnv().REDIS_URL,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      // 숫자를 돌려주면 그만큼 기다렸다가 다시 붙고, 에러를 돌려주면 포기해요.
      reconnectStrategy: (retries, cause) =>
        wasReady ? Math.min(2 ** retries * 100, MAX_RECONNECT_DELAY_MS) : cause,
    },
  });

  client.on('ready', () => {
    if (down) {
      logger.info('Redis 다시 연결됨');
    }
    wasReady = true;
    down = false;
  });

  // 'error' 리스너가 없으면 Node.js 프로세스가 죽어요. 다시 붙는 동안 시도마다 불려서 한 번만 남겨요.
  client.on('error', (error: unknown) => {
    if (!down) {
      logger.error({ err: error }, 'Redis 연결 오류');
      down = true;
    }
  });

  return client;
}

export type RedisClient = ReturnType<typeof createRedisClient>;

let redisClient: RedisClient | undefined;

/**
 * Redis 클라이언트를 돌려줘요. 처음 부를 때 만들고, 그다음부터는 같은 것을 써요.
 * 연결은 connectRedis() 가 해요. (서버를 켤 때 한 번)
 */
export function getRedisClient(): RedisClient {
  redisClient ??= createRedisClient();
  return redisClient;
}

/**
 * 서버를 켤 때: Redis에 연결해요. 연결하지 못하면 에러를 던져요. (서버를 켜지 않게)
 * 실패한 클라이언트는 버려서 다음에 부르면 새로 만들어요.
 */
export async function connectRedis(): Promise<void> {
  const client = getRedisClient();

  if (client.isOpen) {
    return;
  }

  try {
    await client.connect();
  } catch (error) {
    client.destroy();
    redisClient = undefined;
    throw error;
  }
}

/** 연결을 닫아요. (테스트가 끝날 때 · 서버를 끌 때) */
export async function disconnectRedis(): Promise<void> {
  const client = redisClient;
  redisClient = undefined;

  if (client?.isOpen) {
    await client.close();
  }
}

/** 헬스 체크용: PING 이 되는지 봐요. 안 되면 에러를 던져요. */
export async function pingRedis(): Promise<void> {
  if (!redisClient?.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  const response = await redisClient.ping();

  if (response !== 'PONG') {
    throw new Error('Redis PING 응답이 올바르지 않습니다.');
  }
}

/** 명령을 보내기 전에: 연결이 준비된 클라이언트를 돌려주고, 아니면 에러를 던져요. */
export function readyRedis(): RedisClient {
  const client = getRedisClient();

  if (!client.isReady) {
    throw new Error('Redis 연결이 준비되지 않았습니다.');
  }

  return client;
}
