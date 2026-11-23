import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './config/logger.js';
import { getAccessTokenSecret } from './config/auth.js';
import { checkDbConnection } from './db/pool.js';
import { connectRedis } from './db/redis.js';

const env = loadEnv();
getAccessTokenSecret(); // 환경 변수가 설정되어 있는지 확인

// DB에 먼저 연결해 보고(세션 설정까지 확인), 안 되면 서버를 켜지 않아요.
try {
  await checkDbConnection();
} catch (error) {
  throw new Error(
    `MySQL(${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME})에 연결할 수 없습니다. ` +
      '.env 의 DB_* 값과 MySQL이 켜져 있는지 확인해 주세요.',
    { cause: error },
  );
}
logger.info({ db: env.DB_NAME, host: env.DB_HOST, port: env.DB_PORT }, 'DB 연결 OK');

// Redis도 연결해 보고, 안 되면 서버를 켜지 않아요. (주소에 비밀번호가 있을 수 있어서 host:port 만 보여 줘요)
const redisHost = new URL(env.REDIS_URL).host;
try {
  await connectRedis();
} catch (error) {
  throw new Error(
    `Redis(${redisHost})에 연결할 수 없습니다. .env 의 REDIS_URL 과 Redis가 켜져 있는지 확인해 주세요.`,
    { cause: error },
  );
}
logger.info({ host: redisHost }, 'Redis 연결 OK');

const app = createApp({ uploadDir: env.UPLOAD_DIR });

app.listen(env.PORT, (error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: env.PORT }, '서버 실행 중');
});
