import type { RowDataPacket } from 'mysql2';
import { afterAll, describe, expect, it } from 'vitest';

import { checkDbConnection, closePool, getPool, pingDb } from '../../src/db/pool.js';

interface SessionRow extends RowDataPacket {
  timeZone: string;
  isolation: string;
}

describe('MySQL 연결 풀', () => {
  afterAll(async () => {
    await closePool();
  });

  it('연결 확인 · 세션 확인이 통과한다', async () => {
    await expect(pingDb()).resolves.toBeUndefined();
    await expect(checkDbConnection()).resolves.toBeUndefined();
  });

  it('새로 연 연결마다 UTC · READ COMMITTED 가 설정돼 있다', async () => {
    // 동시에 여러 개를 빌려서 서로 다른 연결을 확인해요.
    const connections = await Promise.all([1, 2, 3].map(() => getPool().getConnection()));
    try {
      for (const connection of connections) {
        const [rows] = await connection.query<SessionRow[]>(
          'SELECT @@session.time_zone AS timeZone, @@session.transaction_isolation AS isolation',
        );
        expect(rows[0]).toEqual({ timeZone: '+00:00', isolation: 'READ-COMMITTED' });
      }
    } finally {
      connections.forEach((connection) => connection.release());
    }
  });
});
