import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface SchemaRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
}

interface ForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
}

describe('DB-11 Booth QR and Board Device Schema', () => {
  it('QR 코드 및 메뉴판 기기 테이블이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,
              CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('booth_qr_codes', 'board_devices')`,
    );

    const tables = [...new Set(rows.map((row) => row.TABLE_NAME))];

    expect(tables.sort()).toEqual(['booth_qr_codes', 'board_devices'].sort());
  });

  it('외래 키 3개가 올바르게 연결되어 있다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('booth_qr_codes', 'board_devices')
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map(
      (row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}`,
    );

    expect(actual.sort()).toEqual(
      [
        'booth_qr_codes.booth_id->booths',
        'booth_qr_codes.issued_by_admin_id->admin_accounts',
        'board_devices.booth_id->booths',
      ].sort(),
    );
  });

  it('메뉴판 기기 토큰 해시가 CHAR(64)이다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,
              CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'board_devices'
         AND COLUMN_NAME = 'token_hash'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].DATA_TYPE.toLowerCase()).toBe('char');
    expect(Number(rows[0].CHARACTER_MAXIMUM_LENGTH)).toBe(64);
  });

  it('QR 무효화 및 기기 폐기 컬럼이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,
              CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND (
           (TABLE_NAME = 'booth_qr_codes'
            AND COLUMN_NAME = 'deactivated_at')
           OR
           (TABLE_NAME = 'board_devices'
            AND COLUMN_NAME = 'revoked_at')
         )`,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`).sort()).toEqual(
      ['booth_qr_codes.deactivated_at', 'board_devices.revoked_at'].sort(),
    );
  });
});
