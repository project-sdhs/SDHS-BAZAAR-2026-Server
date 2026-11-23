import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface TableRow extends RowDataPacket {
  TABLE_NAME: string;
}

interface ForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
}

describe('DB-07, DB-08 Admin Scope Schema', () => {
  it('관리자 담당 부스와 담당 반 테이블이 존재한다', async () => {
    const [rows] = await getPool().execute<TableRow[]>(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'admin_account_booths',
           'admin_account_classes'
         )`,
    );

    const names = rows.map((row) => row.TABLE_NAME);

    expect(names.sort()).toEqual(['admin_account_booths', 'admin_account_classes'].sort());
  });

  it('관리자 담당 범위의 FK 4개가 정확하다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT
         TABLE_NAME,
         COLUMN_NAME,
         REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'admin_account_booths',
           'admin_account_classes'
         )
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map(
      (row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}`,
    );

    expect(actual.sort()).toEqual(
      [
        'admin_account_booths.admin_id->admin_accounts',
        'admin_account_booths.booth_id->booths',
        'admin_account_classes.admin_id->admin_accounts',
        'admin_account_classes.class_id->classes',
      ].sort(),
    );
  });
});
