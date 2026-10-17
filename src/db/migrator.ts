import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';

import { loadEnv, type Env } from '../config/env.js';
import { connectionOptions, SESSION_SETUP_SQL } from './pool.js';

/** 마이그레이션 SQL 파일이 있는 곳 (레포 맨 위 migrations/) */
export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

/** 파일 이름 규칙: 숫자 3자리_소문자 설명.sql (예: 002_create_classes.sql) */
const FILE_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

/** 어떤 파일을 실행했는지 적어 두는 표예요. 도구가 직접 만들어요. */
const CREATE_SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(255) NOT NULL PRIMARY KEY,
  checksum   CHAR(64)     NOT NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
)`;

interface AppliedRow extends RowDataPacket {
  name: string;
  checksum: string;
}

interface LockRow extends RowDataPacket {
  locked: number | null;
}

/**
 * 마이그레이션용 연결 하나를 열어요.
 * SQL 파일 하나에 문장이 여러 개 있을 수 있어서 multipleStatements 를 켜요.
 * (API용 풀에서는 켜지 않아요. 켜 두면 SQL 인젝션이 생겼을 때 피해가 커져요)
 */
export async function createMigrationConnection(env: Env = loadEnv()): Promise<mysql.Connection> {
  const connection = await mysql.createConnection({
    ...connectionOptions(env),
    multipleStatements: true,
  });
  await connection.query(SESSION_SETUP_SQL);
  return connection;
}

/** 줄바꿈(CRLF · LF)이 달라도 같은 파일로 보도록 LF로 맞춘 뒤 sha256 */
function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * dir 의 SQL 파일을 이름 순서대로, 아직 실행하지 않은 것만 실행해요. 이번에 실행한 파일 이름들을 돌려줘요.
 * - 실행한 파일은 schema_migrations 에 기록해서 다음에는 건너뛰어요.
 * - 이미 실행한 파일의 내용이 바뀌었으면 멈춰요. 실행한 파일은 고치지 말고 새 파일을 추가해요.
 * - MySQL에서 CREATE · ALTER 는 트랜잭션으로 되돌릴 수 없어요.
 *   파일 중간에서 실패하면 앞 문장은 이미 실행된 상태라, 고친 뒤 다시 돌리기 전에 손으로 정리해야 해요.
 */
export async function runMigrations(
  connection: mysql.Connection,
  dir: string,
  log: (message: string) => void = () => {},
): Promise<string[]> {
  await connection.query(CREATE_SCHEMA_MIGRATIONS);

  // 두 사람이 같은 DB에 동시에 실행해도 한 명씩 돌도록 DB 이름으로 잠가요. (10초까지 기다림)
  const [[lock]] = await connection.query<LockRow[]>(
    "SELECT GET_LOCK(CONCAT('migrate:', DATABASE()), 10) AS locked",
  );
  if (lock.locked !== 1) {
    throw new Error('다른 곳에서 마이그레이션을 실행 중입니다. 잠시 후 다시 해 주세요.');
  }

  try {
    const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
    const badName = files.find((file) => !FILE_NAME.test(file));
    if (badName) {
      throw new Error(`파일 이름이 규칙에 맞지 않습니다: ${badName} (예: 002_create_classes.sql)`);
    }

    const [rows] = await connection.query<AppliedRow[]>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const appliedBefore = new Map(rows.map((row) => [row.name, row.checksum]));

    const applied: string[] = [];
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      const checksum = checksumOf(sql);
      const previous = appliedBefore.get(file);

      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(
            `이미 실행한 파일의 내용이 바뀌었습니다: ${file}\n` +
              '실행한 파일은 고치지 말고, 바꿀 내용(ALTER TABLE 등)을 새 파일로 추가해 주세요.',
          );
        }
        continue;
      }

      try {
        await connection.query(sql);
      } catch (error) {
        throw new Error(`실행하다 실패했습니다: ${file}`, { cause: error });
      }
      await connection.execute('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [
        file,
        checksum,
      ]);
      applied.push(file);
      log(`  ✓ ${file}`);
    }

    return applied;
  } finally {
    await connection.query("SELECT RELEASE_LOCK(CONCAT('migrate:', DATABASE()))");
  }
}
