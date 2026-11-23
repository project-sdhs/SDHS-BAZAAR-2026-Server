import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { RowDataPacket } from 'mysql2';

import { loadEnv } from './config/env.js';
import { closePool, getPool } from './db/pool.js';

// npm run db:reconcile — queries/ 의 대사 쿼리를 모두 돌려서 문제 행을 보여 줘요. (서버 규칙 47)
// 대사 쿼리는 정상이면 0행이에요. 하나라도 행이 나오면 exit code 1 로 끝나요.
const QUERIES_DIR = path.resolve(import.meta.dirname, '../queries');
const FILE_NAME = /^\d{2}_[a-z0-9_]+\.sql$/;
/** 파일마다 보여 줄 최대 행 수 */
const SHOW_ROWS = 20;

const env = loadEnv();
console.log(`대사 쿼리 → ${env.DB_NAME} (${env.DB_HOST}:${env.DB_PORT})`);

const files = (await readdir(QUERIES_DIR)).filter((name) => FILE_NAME.test(name)).sort();
let total = 0;

try {
  for (const file of files) {
    const sql = await readFile(path.join(QUERIES_DIR, file), 'utf8');
    const [rows] = await getPool().query<RowDataPacket[]>(sql);
    total += rows.length;

    if (rows.length === 0) {
      console.log(`OK   ${file}`);
      continue;
    }

    console.log(`문제 ${file}: ${rows.length}행`);
    console.table(rows.slice(0, SHOW_ROWS));
  }
} finally {
  await closePool();
}

console.log(total === 0 ? '문제 0건' : `문제 ${total}건`);

if (total > 0) {
  process.exitCode = 1;
}
