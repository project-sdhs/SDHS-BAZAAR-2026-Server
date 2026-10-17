import type { PoolConnection as CorePoolConnection } from 'mysql2';
import mysql from 'mysql2/promise';

import { loadEnv } from './env.js';

/**
 * 연결이 새로 생길 때마다 처음 한 번 실행하는 설정이에요.
 * - time_zone '+00:00': 시각은 모두 UTC로 저장하고 읽어요. (한국 시간으로 바꾸는 건 앱 · 화면에서)
 * - READ COMMITTED: 트랜잭션 격리 수준. 결제처럼 동시에 몰리는 요청에서 잠금 대기를 줄여요.
 */
const SESSION_SETUP_SQL =
  "SET SESSION time_zone = '+00:00', SESSION transaction_isolation = 'READ-COMMITTED'";

let pool: mysql.Pool | undefined;

/**
 * MySQL 연결 풀을 돌려줘요.
 * 처음 부를 때 .env 의 DB_* 값으로 풀을 만들고, 그다음부터는 같은 풀을 다시 써요.
 * 풀은 연결 여러 개를 열어 두고 돌려 쓰기 때문에 요청마다 새로 연결하지 않아도 돼요.
 *
 * @example
 * const [rows] = await getPool().execute('SELECT * FROM app_versions WHERE id = ?', [id]);
 */
export function getPool(): mysql.Pool {
  if (pool) {
    return pool;
  }

  const env = loadEnv();
  pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: 10,
    // DB에서 읽은 TIMESTAMP를 UTC로 보고 JS Date로 바꿔요. (위 time_zone 설정과 짝)
    timezone: 'Z',
  });

  // 새 연결마다 세션 설정을 먼저 실행해요. 같은 연결의 다음 쿼리는 이게 끝난 뒤에 실행돼요.
  // promise 풀의 'connection' 이벤트는 콜백 방식 연결을 넘겨주기 때문에 pool.pool(콜백 풀)에 등록해요.
  pool.pool.on('connection', (connection: CorePoolConnection) => {
    connection.query(SESSION_SETUP_SQL, (error) => {
      if (error) {
        console.error('DB 세션 설정에 실패했습니다.', error);
      }
    });
  });

  return pool;
}

/** DB에 연결되는지 확인해요. 연결할 수 없으면 에러를 던져요. (서버를 켤 때 사용) */
export async function checkDbConnection(): Promise<void> {
  await getPool().query('SELECT 1');
}
