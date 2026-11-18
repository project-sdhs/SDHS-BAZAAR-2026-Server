
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface SalesRow extends RowDataPacket {
  booth_id: number;
  menu_id: number;
  menu_name: string;
  order_count: number;
  total_quantity: string | number;
  total_sales: string | number;
}

async function loadFixtureQuery(): Promise<string> {
  const sql = await readFile(
    path.join(
      process.cwd(),
      'queries',
      '06_menu_sales_statistics.sql',
    ),
    'utf8',
  );

  // 실제 DB 데이터를 변경하지 않는 테스트용 데이터
  const fixture = `
    WITH fixture_payments AS (
      SELECT 1 AS id, 10 AS booth_id,
        DATE('2026-11-18') AS business_date,
        'completed' AS status, NULL AS deleted_at
      UNION ALL
      SELECT 2, 10, DATE('2026-11-18'),
        'completed', NULL
      UNION ALL
      SELECT 3, 10, DATE('2026-11-18'),
        'refunded', NULL
    ),
    fixture_items AS (
      SELECT 1 AS payment_id, 100 AS menu_id,
        '떡볶이' AS menu_name, 2 AS quantity,
        6000 AS amount, NULL AS deleted_at
      UNION ALL
      SELECT 2, 100, '떡볶이', 1, 3000, NULL
      UNION ALL
      SELECT 3, 100, '떡볶이', 5, 15000, NULL
    )
  `;

  const withItems = sql.replace(
    /\bFROM\s+payment_items\s+pi\b/i,
    'FROM fixture_items pi',
  );

  if (withItems === sql) {
    throw new Error('payment_items 참조를 찾지 못했습니다.');
  }

  const withPayments = withItems.replace(
    /\bJOIN\s+payments\s+p\b/i,
    'JOIN fixture_payments p',
  );

  if (withPayments === withItems) {
    throw new Error('payments 참조를 찾지 못했습니다.');
  }

  return fixture + '\n' + withPayments;
}

describe('DB-16 Menu Sales Statistics', () => {
  it('판매 수량과 매출을 정확히 계산한다', async () => {
    const sql = await loadFixtureQuery();

    const [rows] = await getPool().query<SalesRow[]>(sql);

    expect(rows).toHaveLength(1);

    const row = rows[0];

    expect(row.booth_id).toBe(10);
    expect(row.menu_id).toBe(100);
    expect(row.menu_name).toBe('떡볶이');

    expect(Number(row.order_count)).toBe(2);
    expect(Number(row.total_quantity)).toBe(3);
    expect(Number(row.total_sales)).toBe(9000);
  });

  it('환불된 결제를 매출에서 제외한다', async () => {
    const sql = await loadFixtureQuery();

    const [rows] = await getPool().query<SalesRow[]>(sql);

    // 환불 결제 15,000원은 집계되지 않아야 함
    expect(Number(rows[0].total_sales)).toBe(9000);
    expect(Number(rows[0].total_quantity)).toBe(3);
  });
});
