import { loadEnv } from '../../src/config/env.js';
import { createMigrationConnection, MIGRATIONS_DIR, runMigrations } from '../../src/db/migrator.js';

/** DB 테스트 전에 한 번: 테스트 DB가 맞는지 확인하고, 마이그레이션으로 테이블을 최신으로 맞춰요. */
export default async function setup(): Promise<void> {
  const env = loadEnv();

  // DB 테스트는 표를 비우고 다시 채워요. 실제 데이터가 있는 DB에서 돌면 안 돼요.
  if (!env.DB_NAME.endsWith('_test')) {
    throw new Error(
      `DB 테스트는 이름이 _test 로 끝나는 DB에서만 돌려요. (지금 DB_NAME=${env.DB_NAME})\n` +
        '.env.test 에 DB_NAME=sdhs_bazaar_test 처럼 적어 주세요.',
    );
  }

  const connection = await createMigrationConnection(env);
  try {
    await runMigrations(connection, MIGRATIONS_DIR);
  } finally {
    await connection.end();
  }
}
