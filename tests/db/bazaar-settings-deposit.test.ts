
import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface ForeignKeyRow extends RowDataPacket {
  CONSTRAINT_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
  DELETE_RULE: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

describe('DB-10 Bazaar Deposit Account', () => {
  it('입금 계좌 외래 키가 존재한다', async () => {
    const [rows] = await getPool().query<ForeignKeyRow[]>(`
      SELECT
        k.CONSTRAINT_NAME,
        k.COLUMN_NAME,
        k.REFERENCED_TABLE_NAME,
        k.REFERENCED_COLUMN_NAME,
        r.DELETE_RULE
      FROM information_schema.KEY_COLUMN_USAGE k
      JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
       AND r.TABLE_NAME = k.TABLE_NAME
       AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = DATABASE()
        AND k.TABLE_NAME = 'bazaar_settings'
        AND k.COLUMN_NAME = 'deposit_account_id'
    `);

    expect(rows).toHaveLength(1);

    expect(rows[0]).toMatchObject({
      CONSTRAINT_NAME: 'fk_bazaar_settings_deposit_account',
      COLUMN_NAME: 'deposit_account_id',
      REFERENCED_TABLE_NAME: 'deposit_accounts',
      REFERENCED_COLUMN_NAME: 'id',
    });
  });

  it('사용 중인 계좌의 물리적 삭제를 제한한다', async () => {
    const [rows] = await getPool().query<ForeignKeyRow[]>(`
      SELECT r.DELETE_RULE
      FROM information_schema.REFERENTIAL_CONSTRAINTS r
      WHERE r.CONSTRAINT_SCHEMA = DATABASE()
        AND r.TABLE_NAME = 'bazaar_settings'
        AND r.CONSTRAINT_NAME =
          'fk_bazaar_settings_deposit_account'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0].DELETE_RULE).toBe('RESTRICT');
  });

  it('존재하지 않는 계좌를 참조하는 설정이 없다', async () => {
    const [rows] = await getPool().query<CountRow[]>(`
      SELECT COUNT(*) AS total
      FROM bazaar_settings s
      LEFT JOIN deposit_accounts a
        ON s.deposit_account_id = a.id
      WHERE s.deposit_account_id IS NOT NULL
        AND a.id IS NULL
    `);

    expect(rows[0].total).toBe(0);
  });
});
