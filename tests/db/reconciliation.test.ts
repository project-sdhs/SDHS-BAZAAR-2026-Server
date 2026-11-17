
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

const queries = [
  '01_credit_ledger_balance_check.sql',
  '02_credit_ledger_missing_entries.sql',
  '03_credit_ledger_duplicate_and_amount_check.sql',
  '04_payment_items_total_check.sql',
];

describe('DB-16 Reconciliation Queries', () => {
  for (const filename of queries) {
    it(`${filename} 실행 시 오류가 없다`, async () => {
      const filePath = path.join(
        process.cwd(),
        'queries',
        filename,
      );

      const sql = await readFile(filePath, 'utf8');

      expect(sql.trim()).not.toBe('');

      const [rows] = await getPool().query<RowDataPacket[]>(sql);

      expect(Array.isArray(rows)).toBe(true);
    });
  }
});
