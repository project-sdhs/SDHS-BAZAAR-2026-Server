import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';

import { insertAuditLog } from '../src/repositories/audit-log.repository.js';

/** execute 만 있는 가짜 connection. 어떤 SQL · 값으로 불렸는지 확인해요. */
function fakeConnection() {
  const execute = vi.fn<(sql: string, values: unknown[]) => Promise<[{ insertId: number }]>>(() =>
    Promise.resolve([{ insertId: 7 }]),
  );
  return { connection: { execute } as unknown as PoolConnection, execute };
}

/** INSERT 에 넘긴 값 12개를 칼럼 이름과 짝지어 돌려줘요. */
function insertedValues(execute: ReturnType<typeof fakeConnection>['execute']) {
  const [, values] = execute.mock.calls[0];
  const columns = [
    'actor_type',
    'actor_admin_id',
    'actor_user_id',
    'actor_role',
    'action',
    'target_type',
    'target_id',
    'booth_id',
    'before_value',
    'after_value',
    'reason',
    'request_id',
  ];
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
}

describe('insertAuditLog', () => {
  it('관리자 계정의 작업을 전/후 값 · 사유 · 요청 ID 와 함께 남기고 새 id 를 돌려준다', async () => {
    const { connection, execute } = fakeConnection();

    const id = await insertAuditLog(connection, {
      actor: { type: 'admin_account', adminId: 3, role: 'admin' },
      action: 'credit.adjust',
      target: { type: 'users', id: 1042 },
      before: { creditBalance: 5000 },
      after: { creditBalance: 3000 },
      reason: '현장 환불',
      requestId: 'req-123',
    });

    expect(id).toBe(7);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(insertedValues(execute)).toEqual({
      actor_type: 'admin_account',
      actor_admin_id: 3,
      actor_user_id: null,
      actor_role: 'admin',
      action: 'credit.adjust',
      target_type: 'users',
      target_id: 1042,
      booth_id: null,
      before_value: '{"creditBalance":5000}',
      after_value: '{"creditBalance":3000}',
      reason: '현장 환불',
      request_id: 'req-123',
    });
  });

  it('앱 회원의 작업은 actor_user_id 에, 부스 작업은 booth_id 에 남긴다', async () => {
    const { connection, execute } = fakeConnection();

    await insertAuditLog(connection, {
      actor: { type: 'user', userId: 1042, role: 'cashier' },
      action: 'booth.ordering_pause',
      target: { type: 'booths', id: 23 },
      boothId: 23,
    });

    expect(insertedValues(execute)).toMatchObject({
      actor_type: 'user',
      actor_admin_id: null,
      actor_user_id: 1042,
      actor_role: 'cashier',
      booth_id: 23,
      before_value: null,
      after_value: null,
      reason: null,
      request_id: null,
    });
  });

  it('시스템 작업은 actor id 가 모두 비어 있고 역할은 system 이다', async () => {
    const { connection, execute } = fakeConnection();

    await insertAuditLog(connection, { actor: { type: 'system' }, action: 'charge.auto_approve' });

    expect(insertedValues(execute)).toMatchObject({
      actor_type: 'system',
      actor_admin_id: null,
      actor_user_id: null,
      actor_role: 'system',
      target_type: null,
      target_id: null,
    });
  });

  it('사유는 200자 · 요청 ID 는 64자를 넘으면 잘라서 저장한다', async () => {
    const { connection, execute } = fakeConnection();

    await insertAuditLog(connection, {
      actor: { type: 'system' },
      action: 'settings.update',
      reason: '가'.repeat(250),
      requestId: 'r'.repeat(100),
    });

    const values = insertedValues(execute);
    expect(values.reason).toBe('가'.repeat(200));
    expect(values.request_id).toBe('r'.repeat(64));
  });
});
