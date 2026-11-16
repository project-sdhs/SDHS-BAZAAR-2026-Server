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

describe('DB-10 Bazaar Settings Schema', () => {
  it('설정 및 입금 계좌 테이블이 존재한다', async () => {
    const [rows] = await getPool().execute<TableRow[]>(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'bazaar_settings',
           'deposit_accounts'
         )`,
    );

    const names = rows.map((row) => row.TABLE_NAME);

    expect(names.sort()).toEqual(['bazaar_settings', 'deposit_accounts'].sort());
  });

  it('외래 키 3개가 올바르게 연결되어 있다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT
         TABLE_NAME,
         COLUMN_NAME,
         REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'bazaar_settings',
           'deposit_accounts'
         )
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map(
      (row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}`,
    );

    expect(actual.sort()).toEqual(
      [
        'deposit_accounts.created_by_admin_id->admin_accounts',
        'bazaar_settings.deposit_account_id->deposit_accounts',
        'bazaar_settings.updated_by_admin_id->admin_accounts',
      ].sort(),
    );
  });
});
