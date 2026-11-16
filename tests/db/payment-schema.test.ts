import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface SchemaRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
}

interface ForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
}

describe('DB-12 Payment Schema', () => {
  it('결제 관련 테이블 4개가 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'booth_daily_payment_counters',
           'payments',
           'payment_items',
           'payment_refunds'
         )`,
    );

    const tables = [...new Set(rows.map((row) => row.TABLE_NAME))];

    expect(tables.sort()).toEqual(
      ['booth_daily_payment_counters', 'payments', 'payment_items', 'payment_refunds'].sort(),
    );
  });

  it('외래 키 7개가 올바르게 연결되어 있다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT
         TABLE_NAME,
         COLUMN_NAME,
         REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'booth_daily_payment_counters',
           'payments',
           'payment_items',
           'payment_refunds'
         )
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map(
      (row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}->${row.REFERENCED_TABLE_NAME}`,
    );

    expect(actual.sort()).toEqual(
      [
        'booth_daily_payment_counters.booth_id->booths',
        'payments.user_id->users',
        'payments.booth_id->booths',
        'payment_items.payment_id->payments',
        'payment_items.menu_id->menus',
        'payment_refunds.payment_id->payments',
        'payment_refunds.refunded_by_admin_id->admin_accounts',
      ].sort(),
    );
  });

  it('결제 테이블의 핵심 컬럼이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'payments'`,
    );

    const columns = rows.map((row) => row.COLUMN_NAME);

    expect(columns).toContain('user_id');
    expect(columns).toContain('booth_id');
    expect(columns).toContain('payment_no');
    expect(columns).toContain('total_amount');
    expect(columns).toContain('business_date');
    expect(columns).toContain('idempotency_key');
    expect(columns).toContain('request_hash');
    expect(columns).toContain('status');
  });

  it('결제 메뉴 스냅숏 컬럼이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'payment_items'`,
    );

    const columns = rows.map((row) => row.COLUMN_NAME);

    expect(columns).toContain('payment_id');
    expect(columns).toContain('menu_id');
    expect(columns).toContain('line_no');
    expect(columns).toContain('menu_name');
    expect(columns).toContain('unit_price');
    expect(columns).toContain('quantity');
    expect(columns).toContain('amount');
  });

  it('환불 및 일일 결제 번호 컬럼이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND (
           (TABLE_NAME = 'payment_refunds'
            AND COLUMN_NAME IN (
              'payment_id',
              'refunded_by_admin_id',
              'reason'
            ))
           OR
           (TABLE_NAME = 'booth_daily_payment_counters'
            AND COLUMN_NAME IN (
              'booth_id',
              'business_date',
              'last_no'
            ))
         )`,
    );

    expect(rows).toHaveLength(6);
  });
});
