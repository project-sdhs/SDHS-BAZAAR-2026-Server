import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// npm run test:db: 실제 MySQL(테스트 DB)에 붙는 tests/db/ 만 돌려요.
// 환경 변수는 .env.test → .env 순서로 읽어요. 이미 있는 값은 덮어쓰지 않아서
// .env.test 의 값(DB_NAME=sdhs_bazaar_test)이 .env 보다 먼저고, CI처럼 직접 넣은 환경 변수가 가장 먼저예요.
for (const file of ['.env.test', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/global-setup.ts'],
    // 모든 테스트 파일이 같은 DB를 쓰니까 한 파일씩 차례로 돌려요.
    fileParallelism: false,
  },
});
