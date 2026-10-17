import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { checkDbConnection } from './db/pool.js';

const env = loadEnv();

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
console.log(`[${env.NODE_ENV}] DB 연결 OK → ${env.DB_NAME} (${env.DB_HOST}:${env.DB_PORT})`);

const app = createApp({ uploadDir: env.UPLOAD_DIR });

app.listen(env.PORT, (error) => {
  if (error) {
    throw error;
  }
  console.log(`[${env.NODE_ENV}] 서버 실행 중 → http://localhost:${env.PORT}/health`);
});
