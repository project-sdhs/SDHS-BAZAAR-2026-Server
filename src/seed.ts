import path from 'node:path';

import { loadEnv } from './config/env.js';
import { closePool } from './db/pool.js';
import { withTransaction } from './db/transaction.js';
import { loadSeed } from './seed/load.js';
import { validateSeedDir } from './seed/validate.js';

// npm run seed:check -- [폴더]            CSV 검사만 해요. (DB 안 씀)
// npm run db:seed -- [폴더] [--replace]   검사한 뒤 한 트랜잭션으로 DB에 넣어요.
// 폴더를 안 적으면 seed-data/example (팀 목업 데이터). 실데이터는 seed-data/real/ 에 두고 git에 올리지 않아요.
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const replace = args.includes('--replace');
const dir = path.resolve(args.find((arg) => !arg.startsWith('--')) ?? 'seed-data/example');

console.log(`시드 CSV 검사 → ${path.relative(process.cwd(), dir) || '.'}`);
const { data, errors } = await validateSeedDir(dir);

if (!data) {
  for (const error of errors) {
    console.error(`  ✗ ${error}`);
  }
  console.error(`문제 ${errors.length}개. 고친 뒤 다시 돌려 주세요.`);
  process.exit(1);
}

console.log(
  `  ✓ 건물 ${data.buildings.length} · 층 ${data.floors.length} · 구역 ${data.zones.length} · ` +
    `부스 ${data.booths.length} · 메뉴 ${data.menus.length} · 부스 위치 ${data.boothLocations.length} · ` +
    `입금 계좌 ${data.depositAccounts.length} · 설정 ${data.settings ? 1 : 0}`,
);

if (checkOnly) {
  process.exit(0);
}

const env = loadEnv();
console.log(
  `시드 넣기 → ${env.DB_NAME} (${env.DB_HOST}:${env.DB_PORT})${replace ? ' · 교체' : ''}`,
);

try {
  const summary = await withTransaction((connection) => loadSeed(connection, data, { replace }));
  console.log(`완료: ${JSON.stringify(summary)}`);
} catch (error) {
  // 한 트랜잭션이라 실패하면 아무것도 들어가지 않아요.
  console.error(`실패(아무것도 넣지 않았어요): ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
