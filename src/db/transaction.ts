import type { PoolConnection } from 'mysql2/promise';

import { getPool } from './pool.js';

/** 교착(1213) · 잠금 대기 초과(1205): 트랜잭션을 처음부터 다시 하면 대부분 성공해요. */
const RETRYABLE_ERRNOS = new Set([1213, 1205]);
const MAX_ATTEMPTS = 3;

function isRetryable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errno' in error &&
    typeof error.errno === 'number' &&
    RETRYABLE_ERRNOS.has(error.errno)
  );
}

/**
 * fn 을 트랜잭션 하나로 실행하고, fn 이 돌려준 값을 그대로 돌려줘요. (서버 규칙 1)
 * - fn 이 끝나면 COMMIT, 에러가 나면 ROLLBACK 하고 그 에러를 다시 던져요.
 * - 교착 · 잠금 대기 초과면 fn 을 처음부터 다시 실행해요. (최대 3번)
 *
 * 꼭 지킬 것
 * - fn 안의 쿼리는 넘겨받은 connection 으로 해요. getPool() 로 하면 트랜잭션 밖에서 실행돼요.
 * - fn 은 여러 번 실행될 수 있어요. 외부 호출(Google · Redis · 파일 · 알림)은 fn 밖에서, 커밋이 끝난 뒤에 해요.
 *
 * @example
 * const paymentId = await withTransaction(async (connection) => {
 *   await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
 *   const [result] = await connection.execute<ResultSetHeader>('INSERT INTO payments ...', [...]);
 *   return result.insertId;
 * });
 */
export async function withTransaction<T>(
  fn: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const connection = await getPool().getConnection();
    let broken = false;

    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ROLLBACK 도 안 되면 연결이 끊긴 거예요. 이 연결은 풀에 돌려주지 않고 버려요.
        broken = true;
      }

      if (attempt < MAX_ATTEMPTS && isRetryable(error)) {
        continue;
      }
      throw error;
    } finally {
      if (broken) {
        connection.destroy();
      } else {
        connection.release();
      }
    }
  }
}
