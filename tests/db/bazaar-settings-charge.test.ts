
import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface ConstraintRow extends RowDataPacket {
  CONSTRAINT_NAME: string;
}

describe('DB-10 Bazaar Settings Charge Checks', () => {
  it('충전 금액 CHECK 제약조건이 존재한다', async () => {
    const [rows] = await getPool().query<ConstraintRow[]>(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bazaar_settings'
        AND CONSTRAINT_TYPE = 'CHECK'
    `);

    const names = rows.map((row) => row.CONSTRAINT_NAME);

    expect(names).toContain('chk_bazaar_charge_range');
    expect(names).toContain('chk_bazaar_balance_limit');
  });

  it('최대 충전 금액이 최소 충전 금액보다 작으면 거부한다', async () => {
    const connection = await getPool().getConnection();

    try {
      await connection.query(`
        CREATE TEMPORARY TABLE tmp_bazaar_charge_check
        LIKE bazaar_settings
      `);

      await expect(
        connection.execute(
          `INSERT INTO tmp_bazaar_charge_check
             (
               event_name,
               event_start_date,
               event_end_date,
               charge_min,
               charge_max
             )
           VALUES (?, ?, ?, ?, ?)`,
          [
            '테스트 행사',
            '2026-11-20',
            '2026-11-21',
            5000,
            3000,
          ],
        ),
      ).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
    } finally {
      try {
        await connection.query(
          'DROP TEMPORARY TABLE IF EXISTS tmp_bazaar_charge_check',
        );
      } finally {
        connection.release();
      }
    }
  });

  it('잔액 한도가 0원이면 거부한다', async () => {
    const connection = await getPool().getConnection();

    try {
      await connection.query(`
        CREATE TEMPORARY TABLE tmp_bazaar_balance_check
        LIKE bazaar_settings
      `);

      await expect(
        connection.execute(
          `INSERT INTO tmp_bazaar_balance_check
             (
               event_name,
               event_start_date,
               event_end_date,
               balance_limit
             )
           VALUES (?, ?, ?, ?)`,
          [
            '테스트 행사',
            '2026-11-20',
            '2026-11-21',
            0,
          ],
        ),
      ).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
    } finally {
      try {
        await connection.query(
          'DROP TEMPORARY TABLE IF EXISTS tmp_bazaar_balance_check',
        );
      } finally {
        connection.release();
      }
    }
  });
});
