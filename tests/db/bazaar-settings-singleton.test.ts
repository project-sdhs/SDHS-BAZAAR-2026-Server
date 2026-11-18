
import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface IndexRow extends RowDataPacket {
  INDEX_NAME: string;
  COLUMN_NAME: string;
  NON_UNIQUE: number;
}

interface CountRow extends RowDataPacket {
  total: number;
}

describe('DB-10 Bazaar Settings Singleton', () => {
  it('singleton 컬럼에 UNIQUE 제약조건이 존재한다', async () => {
    const [rows] = await getPool().query<IndexRow[]>(`
      SELECT
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bazaar_settings'
        AND INDEX_NAME = 'uq_bazaar_settings_singleton'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0].COLUMN_NAME).toBe('singleton');
    expect(rows[0].NON_UNIQUE).toBe(0);
  });

  it('바자회 설정은 최대 1행만 존재한다', async () => {
    const [rows] = await getPool().query<CountRow[]>(`
      SELECT COUNT(*) AS total
      FROM bazaar_settings
    `);

    expect(rows[0].total).toBeLessThanOrEqual(1);
  });
});
