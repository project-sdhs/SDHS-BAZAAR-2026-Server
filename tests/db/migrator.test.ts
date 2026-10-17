import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Connection } from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createMigrationConnection, runMigrations } from '../../src/db/migrator.js';

// 진짜 migrations/ 대신 임시 폴더에 테스트용 파일을 만들어서 도구가 맞게 도는지 확인해요.
const TABLE = 'zz_migrator_test';
const FILES = ['901_zz_create.sql', '902_zz_insert.sql'];

describe('runMigrations (실제 DB)', () => {
  let connection: Connection;
  let dir: string;

  async function cleanUp() {
    await connection.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await connection.query('DELETE FROM schema_migrations WHERE name LIKE ?', ['9%_zz_%']);
  }

  beforeAll(async () => {
    connection = await createMigrationConnection();
  });

  afterAll(async () => {
    await cleanUp();
    await connection.end();
  });

  beforeEach(async () => {
    await cleanUp();
    dir = await mkdtemp(path.join(tmpdir(), 'migrations-'));
    await writeFile(
      path.join(dir, FILES[0]),
      `CREATE TABLE ${TABLE} (id INT PRIMARY KEY);\nINSERT INTO ${TABLE} VALUES (1);`,
    );
    await writeFile(path.join(dir, FILES[1]), `INSERT INTO ${TABLE} VALUES (2);`);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('처음에는 모든 파일을 이름 순서대로 실행하고, 두 번째에는 아무것도 하지 않는다', async () => {
    expect(await runMigrations(connection, dir)).toEqual(FILES);
    expect(await runMigrations(connection, dir)).toEqual([]);

    const [rows] = await connection.query(`SELECT id FROM ${TABLE} ORDER BY id`);
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('새 파일만 이어서 실행한다', async () => {
    await runMigrations(connection, dir);
    await writeFile(path.join(dir, '903_zz_more.sql'), `INSERT INTO ${TABLE} VALUES (3);`);

    expect(await runMigrations(connection, dir)).toEqual(['903_zz_more.sql']);
  });

  it('이미 실행한 파일의 내용이 바뀌면 멈춘다 (줄바꿈 CRLF · LF 차이는 같은 파일로 본다)', async () => {
    await runMigrations(connection, dir);

    await writeFile(
      path.join(dir, FILES[1]),
      `INSERT INTO ${TABLE} VALUES (2);`.replace(/\n/g, '\r\n'),
    );
    await expect(runMigrations(connection, dir)).resolves.toEqual([]);

    await writeFile(path.join(dir, FILES[1]), `INSERT INTO ${TABLE} VALUES (20);`);
    await expect(runMigrations(connection, dir)).rejects.toThrow(
      /내용이 바뀌었습니다: 902_zz_insert\.sql/,
    );
  });

  it('파일 이름이 규칙에 맞지 않으면 아무것도 실행하지 않고 멈춘다', async () => {
    await writeFile(path.join(dir, 'create users.sql'), 'SELECT 1;');

    await expect(runMigrations(connection, dir)).rejects.toThrow(/규칙에 맞지 않습니다/);
    const [rows] = await connection.query('SHOW TABLES LIKE ?', [TABLE]);
    expect(rows).toEqual([]);
  });

  it('SQL이 틀린 파일에서 멈추고, 그 파일은 기록하지 않아서 고친 뒤 다시 실행된다', async () => {
    await writeFile(path.join(dir, FILES[1]), 'INSERT INTO no_such_table VALUES (2);');

    await expect(runMigrations(connection, dir)).rejects.toThrow(/실행하다 실패했습니다: 902/);

    await writeFile(path.join(dir, FILES[1]), `INSERT INTO ${TABLE} VALUES (2);`);
    expect(await runMigrations(connection, dir)).toEqual([FILES[1]]);
  });
});
