import { loadEnv } from './config/env.js';
import { createMigrationConnection, MIGRATIONS_DIR, runMigrations } from './db/migrator.js';

// npm run db:migrate — migrations/ 의 SQL 파일 중 아직 실행하지 않은 것을 순서대로 실행해요.
const env = loadEnv();
console.log(`마이그레이션 → ${env.DB_NAME} (${env.DB_HOST}:${env.DB_PORT})`);

const connection = await createMigrationConnection(env);
try {
  const applied = await runMigrations(connection, MIGRATIONS_DIR, console.log);
  console.log(
    applied.length > 0
      ? `완료: ${applied.length}개 실행`
      : '새로 실행할 파일이 없습니다. 이미 최신이에요.',
  );
} finally {
  await connection.end();
}
