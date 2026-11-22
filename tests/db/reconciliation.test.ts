import { readdir } from 'node:fs/promises';

import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';

import {
  HASH,
  idempotencyKey,
  inRollback,
  insert,
  issuesOf,
  QUERIES_DIR,
  runQuery,
  seedWorld,
  update,
  type World,
} from './reconciliation-fixture.js';

const Q1 = '01_credit_ledger_balance_check.sql';
const Q2 = '02_credit_ledger_missing_entries.sql';
const Q3 = '03_credit_ledger_duplicate_and_amount_check.sql';
const Q4 = '04_payment_items_total_check.sql';
const Q5 = '05_payment_number_check.sql';
const Q6 = '06_booth_menu_stats_check.sql';
const Q7 = '07_payment_refund_status_check.sql';
const Q8 = '08_charge_request_check.sql';

describe('DB-16 대사 쿼리', () => {
  it('queries/ 의 쿼리 파일이 8개이고 모두 오류 없이 돈다', async () => {
    const files = (await readdir(QUERIES_DIR)).filter((name) => name.endsWith('.sql')).sort();

    expect(files).toEqual([Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8]);

    await inRollback(async (connection) => {
      for (const file of files) {
        await expect(runQuery(connection, file)).resolves.toEqual(expect.any(Array));
      }
    });
  });

  it('정상 데이터면 모든 쿼리가 0행이다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);

      for (const file of [Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8]) {
        expect(issuesOf(await runQuery(connection, file), world), file).toEqual([]);
      }
    });
  });
});

describe('01 원장 ↔ 잔액', () => {
  it('잔액 캐시가 원장 합계와 다르면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'users', world.userId, { credit_balance: 8000 });

      expect(issuesOf(await runQuery(connection, Q1), world)).toEqual(['BALANCE_MISMATCH']);
    });
  });

  it('원장 사슬(balance_after)이 끊기면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'credit_ledger_entries', world.paymentEntryId, {
        balance_after: 6000,
      });

      expect(issuesOf(await runQuery(connection, Q1), world)).toContain('LEDGER_CHAIN_BROKEN');
    });
  });

  it('사슬은 created_at 이 아니라 id 순서로 본다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      // 시각만 뒤섞여도 id 순 사슬은 맞으니까 정상
      await update(connection, 'credit_ledger_entries', world.chargeEntryId, {
        created_at: '2030-01-01 00:00:00',
      });

      expect(issuesOf(await runQuery(connection, Q1), world)).toEqual([]);
    });
  });
});

describe('02 원장 누락', () => {
  it('승인 충전 · 결제 · 환불의 원장이 없으면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await connection.query('DELETE FROM credit_ledger_entries WHERE id IN (?, ?, ?)', [
        world.chargeEntryId,
        world.paymentEntryId,
        world.refundEntryId,
      ]);

      expect(issuesOf(await runQuery(connection, Q2), world).sort()).toEqual([
        'CHARGE_LEDGER_MISSING',
        'PAYMENT_LEDGER_MISSING',
        'REFUND_LEDGER_MISSING',
      ]);
    });
  });
});

describe('03 원장 중복 · 금액 · 모양', () => {
  it('같은 결제의 원장이 2개면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await insert(connection, 'credit_ledger_entries', {
        user_id: world.userId,
        entry_type: 'payment',
        amount: -3000,
        balance_after: 4000,
        payment_id: world.paymentId,
      });

      expect(issuesOf(await runQuery(connection, Q3), world)).toContain('DUPLICATE_PAYMENT_ENTRY');
    });
  });

  it('충전 · 결제 · 환불 원장 금액이 출처와 다르면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'credit_ledger_entries', world.chargeEntryId, { amount: 9000 });
      await update(connection, 'credit_ledger_entries', world.paymentEntryId, { amount: -2500 });
      await update(connection, 'credit_ledger_entries', world.refundEntryId, { amount: 1500 });

      expect(issuesOf(await runQuery(connection, Q3), world).sort()).toEqual([
        'CHARGE_AMOUNT_MISMATCH',
        'PAYMENT_AMOUNT_MISMATCH',
        'REFUND_AMOUNT_MISMATCH',
      ]);
    });
  });

  it('승인되지 않은 충전 요청에 원장이 있으면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'charge_requests', world.chargeRequestId, {
        status: 'rejected',
        approved_at: null,
        rejected_at: '2027-11-20 01:01:00',
        bank_deposit_id: null,
      });

      expect(issuesOf(await runQuery(connection, Q3), world)).toEqual(['CHARGE_NOT_APPROVED']);
    });
  });

  it('종류와 부호 · 출처가 안 맞는 원장 항목을 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      // 사유 없는 조정
      await insert(connection, 'credit_ledger_entries', {
        user_id: world.userId,
        entry_type: 'adjustment',
        amount: 500,
        balance_after: 7500,
        adjusted_by_admin_id: world.adminId,
      });
      await update(connection, 'users', world.userId, { credit_balance: 7500 });

      expect(issuesOf(await runQuery(connection, Q3), world)).toEqual(['LEDGER_ENTRY_SHAPE']);
    });
  });

  it('같은 사용자 · 같은 Idempotency-Key 결제가 2개면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      const key = idempotencyKey();
      await update(connection, 'payments', world.paymentId, { idempotency_key: key });
      await update(connection, 'payments', world.refundedPaymentId, { idempotency_key: key });

      expect(issuesOf(await runQuery(connection, Q3), world)).toEqual(['DUPLICATE_PAYMENT_KEY']);
    });
  });
});

describe('04 결제 총액 · 메뉴 금액', () => {
  it('총액 ≠ 메뉴 합계, 금액 ≠ 단가 × 수량을 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'payment_items', world.paymentItemIds[1], { quantity: 2 });

      expect(issuesOf(await runQuery(connection, Q4), world)).toEqual(['ITEM_AMOUNT_MISMATCH']);

      await update(connection, 'payment_items', world.paymentItemIds[1], { amount: 4000 });

      expect(issuesOf(await runQuery(connection, Q4), world)).toEqual(['ITEMS_TOTAL_MISMATCH']);
    });
  });
});

describe('05 결제 번호 · 카운터', () => {
  async function addPayment(
    connection: PoolConnection,
    world: World,
    paymentNo: number,
    businessDate = world.businessDate,
  ): Promise<number> {
    return insert(connection, 'payments', {
      user_id: world.userId,
      booth_id: world.boothId,
      payment_no: paymentNo,
      total_amount: 1000,
      business_date: businessDate,
      idempotency_key: idempotencyKey(),
      request_hash: HASH,
    });
  }

  it('번호가 건너뛰면 그 결제만 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await addPayment(connection, world, 4);
      await update(connection, 'booth_daily_payment_counters', world.counterId, { last_no: 4 });

      const rows = (await runQuery(connection, Q5)).filter(
        (row) => Number(row.booth_id) === world.boothId,
      );

      expect(rows.map((row) => row.issue_type)).toEqual(['NUMBER_GAP']);
      expect(Number(rows[0].expected_no)).toBe(3);
      expect(Number(rows[0].actual_no)).toBe(4);
    });
  });

  it('같은 날 번호가 중복되면 두 결제를 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await addPayment(connection, world, 2);

      expect(issuesOf(await runQuery(connection, Q5), world)).toEqual([
        'DUPLICATE_NUMBER',
        'DUPLICATE_NUMBER',
      ]);
    });
  });

  it('카운터 last_no ≠ 그날 마지막 번호, 카운터 중복을 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'booth_daily_payment_counters', world.counterId, { last_no: 3 });

      expect(issuesOf(await runQuery(connection, Q5), world)).toEqual(['COUNTER_MISMATCH']);

      await update(connection, 'booth_daily_payment_counters', world.counterId, { last_no: 2 });
      await insert(connection, 'booth_daily_payment_counters', {
        booth_id: world.boothId,
        business_date: world.businessDate,
        last_no: 2,
      });

      expect(issuesOf(await runQuery(connection, Q5), world)).toEqual(['DUPLICATE_COUNTER']);
    });
  });

  it('다음 날 1부터(매일 초기화) · 이어서(초기화 끔) 둘 다 정상, 그 밖의 첫 번호는 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      const nextDay = '2027-11-21';
      const paymentId = await addPayment(connection, world, 1, nextDay);
      const counterId = await insert(connection, 'booth_daily_payment_counters', {
        booth_id: world.boothId,
        business_date: nextDay,
        last_no: 1,
      });

      expect(issuesOf(await runQuery(connection, Q5), world)).toEqual([]);

      await update(connection, 'payments', paymentId, { payment_no: 3 });
      await update(connection, 'booth_daily_payment_counters', counterId, { last_no: 3 });

      expect(issuesOf(await runQuery(connection, Q5), world)).toEqual([]);

      await update(connection, 'payments', paymentId, { payment_no: 5 });
      await update(connection, 'booth_daily_payment_counters', counterId, { last_no: 5 });

      expect(issuesOf(await runQuery(connection, Q5), world)).toEqual(['FIRST_NUMBER_WRONG']);
    });
  });
});

describe('06 부스 메뉴 통계', () => {
  it('판매 중 메뉴로 다시 계산한 최저가 · 메뉴 수와 다르면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      // 1,000 메뉴를 품절로 바꾸고 부스 행은 그대로 두면 둘 다 어긋남
      await update(connection, 'menus', world.menuIds[0], { on_sale: false });

      expect(issuesOf(await runQuery(connection, Q6), world).sort()).toEqual([
        'MENU_COUNT_MISMATCH',
        'MIN_PRICE_MISMATCH',
      ]);

      await update(connection, 'booths', world.boothId, { min_price: 2000, menu_count: 1 });

      expect(issuesOf(await runQuery(connection, Q6), world)).toEqual([]);
    });
  });
});

describe('07 결제 상태 ↔ 환불 행', () => {
  it('refunded 인데 환불 행 없음 · 환불 행 있는데 completed 를 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'payments', world.refundedPaymentId, { status: 'completed' });
      await update(connection, 'payments', world.paymentId, { status: 'refunded' });

      expect(issuesOf(await runQuery(connection, Q7), world).sort()).toEqual([
        'REFUNDED_WITHOUT_REFUND_ROW',
        'REFUND_ROW_BUT_COMPLETED',
      ]);
    });
  });
});

describe('08 충전 요청', () => {
  it('승인인데 입금 없음 · 상태와 시각 어긋남을 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await update(connection, 'charge_requests', world.chargeRequestId, {
        bank_deposit_id: null,
        approved_at: null,
      });

      expect(issuesOf(await runQuery(connection, Q8), world).sort()).toEqual([
        'APPROVED_WITHOUT_DEPOSIT',
        'STATUS_TIME_MISMATCH',
      ]);
    });
  });

  it('입금 금액 ≠ 요청 금액, 입금 하나에 요청 두 개를 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      await connection.query('UPDATE bank_deposits SET amount = 9000 WHERE id = ?', [
        world.bankDepositId,
      ]);

      expect(issuesOf(await runQuery(connection, Q8), world)).toEqual(['DEPOSIT_AMOUNT_MISMATCH']);

      await connection.query('UPDATE bank_deposits SET amount = 10000 WHERE id = ?', [
        world.bankDepositId,
      ]);
      await insert(connection, 'charge_requests', {
        user_id: world.userId,
        deposit_account_id: world.depositAccountId,
        idempotency_key: idempotencyKey(),
        amount: 10000,
        status: 'approved',
        depositor_name: '2205 이재원',
        depositor_name_normalized: '2205이재원',
        bank_deposit_id: world.bankDepositId,
        approved_at: '2027-11-20 01:02:00',
      });

      expect(issuesOf(await runQuery(connection, Q8), world)).toEqual(['DEPOSIT_LINKED_TWICE']);
    });
  });

  it('한 사용자의 대기 충전이 2개면 찾는다', async () => {
    await inRollback(async (connection) => {
      const world = await seedWorld(connection);
      for (let i = 0; i < 2; i++) {
        await insert(connection, 'charge_requests', {
          user_id: world.userId,
          deposit_account_id: world.depositAccountId,
          idempotency_key: idempotencyKey(),
          amount: 5000,
          depositor_name: '2205 이재원',
          depositor_name_normalized: '2205이재원',
        });
      }

      expect(issuesOf(await runQuery(connection, Q8), world)).toEqual(['MULTIPLE_PENDING_CHARGES']);
    });
  });
});
