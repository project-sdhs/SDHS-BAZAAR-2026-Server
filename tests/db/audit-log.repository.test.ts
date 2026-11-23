import type { RowDataPacket } from 'mysql2';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { closePool, getPool } from '../../src/db/pool.js';
import { withTransaction } from '../../src/db/transaction.js';
import { findByTarget, insertAuditLog } from '../../src/repositories/audit-log.repository.js';

interface CountRow extends RowDataPacket {
  count: number;
}

async function countAuditLogs(): Promise<number> {
  const [rows] = await getPool().query<CountRow[]>('SELECT COUNT(*) AS count FROM audit_logs');
  return rows[0].count;
}

describe('audit-log repository (DB)', () => {
  beforeEach(async () => {
    await getPool().query('DELETE FROM audit_logs');
  });

  afterAll(async () => {
    await closePool();
  });

  it('트랜잭션이 커밋되면 기록이 남고, 전/후 값을 JSON 으로 다시 읽을 수 있다', async () => {
    await withTransaction((connection) =>
      insertAuditLog(connection, {
        actor: { type: 'system' },
        action: 'settings.update',
        target: { type: 'bazaar_settings', id: 1 },
        before: { orderingOpen: false },
        after: { orderingOpen: true },
        reason: '운영 시작',
        requestId: 'req-db-1',
      }),
    );

    const logs = await findByTarget('bazaar_settings', 1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorType: 'system',
      actorRole: 'system',
      action: 'settings.update',
      beforeValue: { orderingOpen: false },
      afterValue: { orderingOpen: true },
      reason: '운영 시작',
      requestId: 'req-db-1',
    });
  });

  it('같은 트랜잭션의 원래 작업이 실패하면 기록도 같이 사라진다', async () => {
    await expect(
      withTransaction(async (connection) => {
        await insertAuditLog(connection, {
          actor: { type: 'system' },
          action: 'settings.update',
          target: { type: 'bazaar_settings', id: 1 },
        });
        throw new Error('원래 작업 실패');
      }),
    ).rejects.toThrow('원래 작업 실패');

    expect(await countAuditLogs()).toBe(0);
  });
});
