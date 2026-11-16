
import { describe, expect, it } from 'vitest';
import type { RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface SchemaRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
}

interface ForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
}

describe('DB-13 Credit and Deposit Schema', () => {
  it('관련 테이블 4개가 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'deposit_imports',
           'bank_deposits',
           'charge_requests',
           'credit_ledger_entries'
         )`,
    );

    const actual = [...new Set(rows.map(r => r.TABLE_NAME))];

    expect(actual.sort()).toEqual(
      [
        'bank_deposits',
        'charge_requests',
        'credit_ledger_entries',
        'deposit_imports',
      ].sort(),
    );
  });

  it('외래 키 14개가 정상 연결되어 있다', async () => {
    const [rows] = await getPool().execute<ForeignKeyRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'deposit_imports',
           'bank_deposits',
           'charge_requests',
           'credit_ledger_entries'
         )
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );

    const actual = rows.map(
      r => `${r.TABLE_NAME}.${r.COLUMN_NAME}->${r.REFERENCED_TABLE_NAME}`,
    );

    const expected = [
      'deposit_imports.deposit_account_id->deposit_accounts',
      'deposit_imports.uploaded_by_admin_id->admin_accounts',
      'bank_deposits.deposit_import_id->deposit_imports',
      'bank_deposits.deposit_account_id->deposit_accounts',
      'charge_requests.user_id->users',
      'charge_requests.deposit_account_id->deposit_accounts',
      'charge_requests.suggested_bank_deposit_id->bank_deposits',
      'charge_requests.bank_deposit_id->bank_deposits',
      'charge_requests.reviewed_by_admin_id->admin_accounts',
      'credit_ledger_entries.user_id->users',
      'credit_ledger_entries.charge_request_id->charge_requests',
      'credit_ledger_entries.payment_id->payments',
      'credit_ledger_entries.payment_refund_id->payment_refunds',
      'credit_ledger_entries.adjusted_by_admin_id->admin_accounts',
    ];

    expect(actual.sort()).toEqual(expected.sort());
  });

  it('충전 요청 핵심 컬럼이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'charge_requests'`,
    );

    const columns = rows.map(r => r.COLUMN_NAME);

    expect(columns).toContain('idempotency_key');
    expect(columns).toContain('amount');
    expect(columns).toContain('status');
    expect(columns).toContain('bank_deposit_id');
    expect(columns).toContain('approved_at');
    expect(columns).toContain('rejected_at');
  });

  it('은행 입금 핵심 컬럼이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bank_deposits'`,
    );

    const columns = rows.map(r => r.COLUMN_NAME);

    expect(columns).toContain('deposit_import_id');
    expect(columns).toContain('bank_transaction_no');
    expect(columns).toContain('deposited_at');
    expect(columns).toContain('amount');
    expect(columns).toContain('identical_line_seq');
  });

  it('크레딧 원장의 핵심 컬럼이 존재한다', async () => {
    const [rows] = await getPool().execute<SchemaRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'credit_ledger_entries'`,
    );

    const columns = rows.map(r => r.COLUMN_NAME);

    expect(columns).toContain('entry_type');
    expect(columns).toContain('amount');
    expect(columns).toContain('balance_after');
    expect(columns).toContain('charge_request_id');
    expect(columns).toContain('payment_id');
    expect(columns).toContain('payment_refund_id');
  });
});
