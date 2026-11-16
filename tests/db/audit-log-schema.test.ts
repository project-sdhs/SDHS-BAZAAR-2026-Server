import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface SchemaRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
}

interface ForeignKeyRow extends RowDataPacket {
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
}

describe('DB-09 Audit Log Schema', () => {
  it('audit_logs 테이블이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'audit_logs'`,
    );

    expect(rows.length).toBeGreaterThan(0);

    const columns = rows.map((row) => row.COLUMN_NAME);

    expect(columns).toContain('actor_type');
    expect(columns).toContain('actor_role');
    expect(columns).toContain('action');
    expect(columns).toContain('target_type');
    expect(columns).toContain('target_id');
    expect(columns).toContain('request_id');
  });

  it('외래 키 3개가 정상 연결되어 있다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'audit_logs'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map((row) => `${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}`);

    expect(actual.sort()).toEqual(
      ['actor_admin_id->admin_accounts', 'actor_user_id->users', 'booth_id->booths'].sort(),
    );
  });

  it('변경 전후 값이 JSON 타입으로 정의되어 있다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'audit_logs'
         AND COLUMN_NAME IN ('before_value', 'after_value')`,
    );

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.DATA_TYPE.toLowerCase()).toBe('json');
    }
  });
});
