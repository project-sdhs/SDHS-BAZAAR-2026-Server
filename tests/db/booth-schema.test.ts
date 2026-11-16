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

interface CheckRow extends RowDataPacket {
  TABLE_NAME: string;
  CHECK_CLAUSE: string;
}

describe('DB-05 Booth Schema', () => {
  it('부스, 메뉴, 캐셔 테이블이 존재한다', async () => {
    const [rows] = await getPool().execute<TableRow[]>(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'booths',
           'menus',
           'booth_cashiers'
         )`,
    );

    const names = rows.map((row) => row.TABLE_NAME);

    expect(names).toHaveLength(3);
    expect(names).toContain('booths');
    expect(names).toContain('menus');
    expect(names).toContain('booth_cashiers');
  });

  it('외래 키 8개가 올바르게 연결되어 있다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT
         TABLE_NAME,
         COLUMN_NAME,
         REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'booths',
           'menus',
           'booth_cashiers'
         )
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map(
      (row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}`,
    );

    expect(actual.sort()).toEqual(
      [
        'booths.class_id->classes',
        'booths.paused_by_user_id->users',
        'booths.edited_by_admin_id->admin_accounts',
        'menus.booth_id->booths',
        'booth_cashiers.booth_id->booths',
        'booth_cashiers.user_id->users',
        'booth_cashiers.assigned_by_user_id->users',
        'booth_cashiers.assigned_by_admin_id->admin_accounts',
      ].sort(),
    );
  });

  it('메뉴 가격 및 표시 순서 CHECK가 존재한다', async () => {
    const [rows] = await getPool().execute<CheckRow[]>(
      `SELECT
         tc.TABLE_NAME,
         cc.CHECK_CLAUSE
       FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.CHECK_CONSTRAINTS cc
         ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
       WHERE tc.TABLE_SCHEMA = DATABASE()
         AND tc.TABLE_NAME = 'menus'
         AND tc.CONSTRAINT_TYPE = 'CHECK'`,
    );

    const clauses = rows.map((row) => row.CHECK_CLAUSE.toLowerCase()).join(' ');

    expect(clauses).toContain('price');
    expect(clauses).toContain('sort_order');
  });
});
