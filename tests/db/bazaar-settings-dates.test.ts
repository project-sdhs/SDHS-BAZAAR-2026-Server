
import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface ConstraintRow extends RowDataPacket {
  CONSTRAINT_NAME: string;
}

describe('DB-10 Bazaar Settings Date Checks', () => {
  it('날짜와 운영 시간 CHECK 제약조건이 존재한다', async () => {
    const [rows] = await getPool().query<ConstraintRow[]>(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bazaar_settings'
        AND CONSTRAINT_TYPE = 'CHECK'
    `);

    const names = rows.map((row) => row.CONSTRAINT_NAME);

    expect(names).toContain('chk_bazaar_event_dates');
    expect(names).toContain('chk_bazaar_open_hours');
  });

  it('종료일이 시작일보다 빠르면 거부한다', async () => {
    const connection = await getPool().getConnection();

    try {
      await connection.query(`
        CREATE TEMPORARY TABLE tmp_bazaar_settings_dates
        LIKE bazaar_settings
      `);

      await expect(
        connection.execute(
          `INSERT INTO tmp_bazaar_settings_dates
             (event_name, event_start_date, event_end_date)
           VALUES (?, ?, ?)`,
          ['테스트 행사', '2026-11-21', '2026-11-20'],
        ),
      ).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
    } finally {
      try {
        await connection.query(
          'DROP TEMPORARY TABLE IF EXISTS tmp_bazaar_settings_dates',
        );
      } finally {
        connection.release();
      }
    }
  });

  it('운영 종료 시간이 시작 시간보다 빠르면 거부한다', async () => {
    const connection = await getPool().getConnection();

    try {
      await connection.query(`
        CREATE TEMPORARY TABLE tmp_bazaar_settings_hours
        LIKE bazaar_settings
      `);

      await expect(
        connection.execute(
          `INSERT INTO tmp_bazaar_settings_hours
             (
               event_name,
               event_start_date,
               event_end_date,
               default_open_time,
               default_close_time
             )
           VALUES (?, ?, ?, ?, ?)`,
          [
            '테스트 행사',
            '2026-11-20',
            '2026-11-21',
            '15:00:00',
            '10:00:00',
          ],
        ),
      ).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
    } finally {
      try {
        await connection.query(
          'DROP TEMPORARY TABLE IF EXISTS tmp_bazaar_settings_hours',
        );
      } finally {
        connection.release();
      }
    }
  });
});
