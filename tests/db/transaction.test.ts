import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { closePool, getPool } from '../../src/db/pool.js';
import { withTransaction } from '../../src/db/transaction.js';

interface CountRow extends RowDataPacket {
  count: number;
}

async function countVersions(): Promise<number> {
  const [rows] = await getPool().query<CountRow[]>('SELECT COUNT(*) AS count FROM app_versions');
  return rows[0].count;
}

function insertVersion(connection: PoolConnection, version: string) {
  return connection.execute('INSERT INTO app_versions (version) VALUES (?)', [version]);
}

/** MySQL이 주는 에러처럼 errno 가 붙은 에러 */
const mysqlError = (errno: number) => Object.assign(new Error(`errno ${errno}`), { errno });

describe('withTransaction', () => {
  beforeEach(async () => {
    await getPool().query('DELETE FROM app_versions');
  });

  afterAll(async () => {
    await closePool();
  });

  it('끝까지 성공하면 COMMIT 하고 fn 의 반환값을 돌려준다', async () => {
    const result = await withTransaction(async (connection) => {
      await insertVersion(connection, '1.0.0');
      return 'done';
    });

    expect(result).toBe('done');
    expect(await countVersions()).toBe(1);
  });

  it('에러가 나면 ROLLBACK 해서 앞에서 넣은 것도 없던 일이 되고, 에러를 다시 던진다', async () => {
    await expect(
      withTransaction(async (connection) => {
        await insertVersion(connection, '1.0.0');
        throw new Error('중간에 실패');
      }),
    ).rejects.toThrow('중간에 실패');

    expect(await countVersions()).toBe(0);
  });

  it('교착(1213) · 잠금 대기 초과(1205)는 처음부터 다시 해서 성공하면 한 번만 남는다', async () => {
    const fn = vi.fn(async (connection: PoolConnection) => {
      await insertVersion(connection, '1.0.0');
      if (fn.mock.calls.length === 1) throw mysqlError(1213);
      if (fn.mock.calls.length === 2) throw mysqlError(1205);
    });

    await withTransaction(fn);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(await countVersions()).toBe(1);
  });

  it('다시 시도는 최대 3번까지, 다른 에러는 다시 시도하지 않는다', async () => {
    const deadlock = vi.fn(() => Promise.reject(mysqlError(1213)));
    await expect(withTransaction(deadlock)).rejects.toMatchObject({ errno: 1213 });
    expect(deadlock).toHaveBeenCalledTimes(3);

    const duplicate = vi.fn(() => Promise.reject(mysqlError(1062)));
    await expect(withTransaction(duplicate)).rejects.toMatchObject({ errno: 1062 });
    expect(duplicate).toHaveBeenCalledTimes(1);
  });

  it('연결을 풀에 돌려줘서 여러 번 불러도 연결이 모자라지 않는다', async () => {
    // 풀 크기(10)보다 많이 불러도 막히지 않아야 해요.
    for (let i = 0; i < 15; i++) {
      await withTransaction(() => Promise.resolve());
    }
    await expect(withTransaction(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});
