import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

import { getPool } from '../../src/db/pool.js';

/**
 * 대사 쿼리 테스트용 데이터.
 * 트랜잭션 안에서 실제 테이블에 행을 넣고, 같은 연결로 queries/ 의 원본 SQL을 돌린 뒤 ROLLBACK 해요.
 * (테스트 DB에 아무것도 남지 않아요)
 */

export const QUERIES_DIR = path.join(process.cwd(), 'queries');

export interface IssueRow extends RowDataPacket {
  issue_type: string;
  user_id?: number | null;
  booth_id?: number | null;
}

/** fn 을 트랜잭션 안에서 실행하고 끝나면 항상 ROLLBACK 해요. */
export async function inRollback(fn: (connection: PoolConnection) => Promise<void>): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await fn(connection);
  } finally {
    await connection.rollback();
    connection.release();
  }
}

/** queries/<file> 을 그대로 실행해요. */
export async function runQuery(connection: PoolConnection, file: string): Promise<IssueRow[]> {
  const sql = await readFile(path.join(QUERIES_DIR, file), 'utf8');
  const [rows] = await connection.query<IssueRow[]>(sql);
  return rows;
}

export async function insert(
  connection: PoolConnection,
  table: string,
  row: Record<string, unknown>,
): Promise<number> {
  const columns = Object.keys(row);
  const [result] = await connection.query<ResultSetHeader>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    Object.values(row),
  );
  return result.insertId;
}

export async function update(
  connection: PoolConnection,
  table: string,
  id: number,
  values: Record<string, unknown>,
): Promise<void> {
  const sets = Object.keys(values).map((column) => `${column} = ?`);
  await connection.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, [
    ...Object.values(values),
    id,
  ]);
}

let sequence = 0;

/** 테스트마다 겹치지 않는 문자열 (auth_subject · 멱등 키 등) */
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${sequence}`;
}

/** 36자 멱등 키 */
function idempotencyKey(): string {
  return unique('k').padEnd(36, '0').slice(0, 36);
}

const HASH = 'a'.repeat(64);

export interface World {
  adminId: number;
  userId: number;
  boothId: number;
  menuIds: [number, number];
  depositAccountId: number;
  bankDepositId: number;
  chargeRequestId: number;
  chargeEntryId: number;
  /** 완료된 결제 3,000 (메뉴 1,000 × 1 + 2,000 × 1), 결제 번호 1 */
  paymentId: number;
  paymentItemIds: [number, number];
  paymentEntryId: number;
  /** 환불된 결제 2,000, 결제 번호 2 */
  refundedPaymentId: number;
  refundId: number;
  refundEntryId: number;
  counterId: number;
  businessDate: string;
}

/**
 * 모든 대사 쿼리가 0행이 되는 정상 데이터 한 벌.
 * 충전 +10,000 → 결제 −3,000 → 결제 −2,000 → 환불 +2,000 = 잔액 7,000
 */
export async function seedWorld(connection: PoolConnection): Promise<World> {
  const businessDate = '2027-11-20';

  const adminId = await insert(connection, 'admin_accounts', {
    email: `${unique('admin')}@example.com`,
    role: 'admin',
  });

  const userId = await insert(connection, 'users', {
    auth_provider: 'google',
    auth_subject: unique('sub'),
    name: '이재원',
    credit_balance: 7000,
  });

  const boothId = await insert(connection, 'booths', {
    name: '2-3 타코야끼',
    type: 'special',
    open_time: '10:00:00',
    close_time: '15:00:00',
    booth_code: '123456',
    min_price: 1000,
    menu_count: 2,
  });

  const menuIds: [number, number] = [
    await insert(connection, 'menus', {
      booth_id: boothId,
      name: '타코야끼 4알',
      price: 1000,
      sort_order: 1,
    }),
    await insert(connection, 'menus', {
      booth_id: boothId,
      name: '타코야끼 8알',
      price: 2000,
      sort_order: 2,
    }),
  ];

  const depositAccountId = await insert(connection, 'deposit_accounts', {
    bank_name: '테스트은행',
    account_no: '000-0000-0000',
    holder_name: '바자회',
  });

  const depositImportId = await insert(connection, 'deposit_imports', {
    deposit_account_id: depositAccountId,
    original_filename: 'deposits.csv',
    file_size_bytes: 100,
    file_sha256: HASH,
    uploaded_by_admin_id: adminId,
  });

  const bankDepositId = await insert(connection, 'bank_deposits', {
    deposit_import_id: depositImportId,
    csv_line_no: 2,
    deposit_account_id: depositAccountId,
    deposited_at: '2027-11-20 01:00:00',
    depositor_name: '2205 이재원',
    depositor_name_normalized: '2205이재원',
    amount: 10000,
  });

  const chargeRequestId = await insert(connection, 'charge_requests', {
    user_id: userId,
    deposit_account_id: depositAccountId,
    idempotency_key: idempotencyKey(),
    amount: 10000,
    status: 'approved',
    depositor_name: '2205 이재원',
    depositor_name_normalized: '2205이재원',
    bank_deposit_id: bankDepositId,
    approved_at: '2027-11-20 01:01:00',
  });

  const chargeEntryId = await insert(connection, 'credit_ledger_entries', {
    user_id: userId,
    entry_type: 'charge',
    amount: 10000,
    balance_after: 10000,
    charge_request_id: chargeRequestId,
  });

  const paymentId = await insert(connection, 'payments', {
    user_id: userId,
    booth_id: boothId,
    payment_no: 1,
    total_amount: 3000,
    business_date: businessDate,
    idempotency_key: idempotencyKey(),
    request_hash: HASH,
  });

  const paymentItemIds: [number, number] = [
    await insert(connection, 'payment_items', {
      payment_id: paymentId,
      menu_id: menuIds[0],
      line_no: 1,
      menu_name: '타코야끼 4알',
      unit_price: 1000,
      quantity: 1,
      amount: 1000,
    }),
    await insert(connection, 'payment_items', {
      payment_id: paymentId,
      menu_id: menuIds[1],
      line_no: 2,
      menu_name: '타코야끼 8알',
      unit_price: 2000,
      quantity: 1,
      amount: 2000,
    }),
  ];

  const paymentEntryId = await insert(connection, 'credit_ledger_entries', {
    user_id: userId,
    entry_type: 'payment',
    amount: -3000,
    balance_after: 7000,
    payment_id: paymentId,
  });

  const refundedPaymentId = await insert(connection, 'payments', {
    user_id: userId,
    booth_id: boothId,
    status: 'refunded',
    payment_no: 2,
    total_amount: 2000,
    business_date: businessDate,
    idempotency_key: idempotencyKey(),
    request_hash: HASH,
  });

  await insert(connection, 'payment_items', {
    payment_id: refundedPaymentId,
    menu_id: menuIds[1],
    line_no: 1,
    menu_name: '타코야끼 8알',
    unit_price: 2000,
    quantity: 1,
    amount: 2000,
  });

  await insert(connection, 'credit_ledger_entries', {
    user_id: userId,
    entry_type: 'payment',
    amount: -2000,
    balance_after: 5000,
    payment_id: refundedPaymentId,
  });

  const refundId = await insert(connection, 'payment_refunds', {
    payment_id: refundedPaymentId,
    refunded_by_admin_id: adminId,
  });

  const refundEntryId = await insert(connection, 'credit_ledger_entries', {
    user_id: userId,
    entry_type: 'refund',
    amount: 2000,
    balance_after: 7000,
    payment_refund_id: refundId,
  });

  const counterId = await insert(connection, 'booth_daily_payment_counters', {
    booth_id: boothId,
    business_date: businessDate,
    last_no: 2,
  });

  return {
    adminId,
    userId,
    boothId,
    menuIds,
    depositAccountId,
    bankDepositId,
    chargeRequestId,
    chargeEntryId,
    paymentId,
    paymentItemIds,
    paymentEntryId,
    refundedPaymentId,
    refundId,
    refundEntryId,
    counterId,
    businessDate,
  };
}

/** 대사 결과 중 이 테스트 데이터(사용자 · 부스)에 대한 행만 (테스트 DB의 다른 데이터는 빼고) */
export function issuesOf(rows: IssueRow[], world: World): string[] {
  return rows
    .filter((row) => Number(row.user_id) === world.userId || Number(row.booth_id) === world.boothId)
    .map((row) => row.issue_type);
}

export { idempotencyKey, HASH };
