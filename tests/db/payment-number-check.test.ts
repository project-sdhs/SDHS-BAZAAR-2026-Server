
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface IssueRow extends RowDataPacket {
  payment_no: number;
  expected_no: number;
  issue_type: string;
}

async function loadSql(): Promise<string> {
  return readFile(
    path.join(
      process.cwd(),
      'queries',
      '05_payment_number_check.sql',
    ),
    'utf8',
  );
}

// 실제 테이블 대신 테스트용 임시 결제 데이터를 사용
function withFixture(sql: string, numbers: number[]): string {
  const fixtureRows = numbers.map(
    (paymentNo, index) => `
      SELECT
        ${index + 1} AS id,
        100 AS booth_id,
        DATE('2026-11-18') AS business_date,
        ${paymentNo} AS payment_no,
        NULL AS deleted_at
    `,
  );

  const fixture = fixtureRows.join(' UNION ALL ');


const sqlWithFixture = sql.replace(
  /\bWITH\s+numbered_payments\s+AS\s*\(/i,
  `WITH fixture_payments AS (${fixture}),
   numbered_payments AS (`,
);


  if (sqlWithFixture === sql) {
    throw new Error('SQL의 WITH 구문을 찾지 못했습니다.');
  }

  const finalSql = sqlWithFixture.replace(
    /\bFROM\s+payments\b/i,
    'FROM fixture_payments',
  );

  if (finalSql === sqlWithFixture) {
    throw new Error('SQL의 payments 테이블 참조를 찾지 못했습니다.');
  }

  return finalSql;
}

describe('DB-16 Payment Number Check', () => {
  it('정상 번호 1, 2, 3은 오류가 없다', async () => {
    const sql = withFixture(await loadSql(), [1, 2, 3]);

    const [rows] = await getPool().query<IssueRow[]>(sql);

    expect(rows).toHaveLength(0);
  });

  it('결제 번호 3이 누락되면 오류를 탐지한다', async () => {
    const sql = withFixture(await loadSql(), [1, 2, 4]);

    const [rows] = await getPool().query<IssueRow[]>(sql);

    expect(rows).toHaveLength(1);
    expect(rows[0].payment_no).toBe(4);
    expect(rows[0].expected_no).toBe(3);
    expect(rows[0].issue_type).toBe(
      'NUMBER_GAP_OR_MISMATCH',
    );
  });

  it('결제 번호가 중복되면 오류를 탐지한다', async () => {
    const sql = withFixture(await loadSql(), [1, 2, 2]);

    const [rows] = await getPool().query<IssueRow[]>(sql);

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.payment_no).toBe(2);
      expect(row.issue_type).toBe('DUPLICATE_NUMBER');
    }
  });
});
