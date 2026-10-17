import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { AppVersion } from '../models/app-version.model.js';

/** app_versions 테이블 한 줄 (DB 컬럼 이름 그대로) */
interface AppVersionRow extends RowDataPacket {
  id: number;
  version: string;
  /** BOOLEAN 은 MySQL 안에서 TINYINT(1) 이라 0 또는 1 로 와요 */
  force_update: number;
  created_at: Date;
  updated_at: Date;
}

/** DB 한 줄 → API 모양 (snake_case → camelCase, 0/1 → true/false, Date → ISO 문자열) */
function toAppVersion(row: AppVersionRow): AppVersion {
  return {
    id: row.id,
    version: row.version,
    forceUpdate: row.force_update === 1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_APP_VERSIONS =
  'SELECT id, version, force_update, created_at, updated_at FROM app_versions';

// 값은 SQL 문자열에 직접 이어 붙이지 말고 꼭 ? 자리에 넣어요.
// execute(sql, [값들]) 은 SQL과 값을 따로 보내서 SQL 인젝션을 막아 줘요.

/** 전체 목록 (최근에 등록한 순서) */
export async function findAll(): Promise<AppVersion[]> {
  const [rows] = await getPool().execute<AppVersionRow[]>(
    `${SELECT_APP_VERSIONS} ORDER BY id DESC`,
  );
  return rows.map(toAppVersion);
}

/** 가장 최근에 등록한 버전 = 지금 앱 버전. 하나도 없으면 null */
export async function findLatest(): Promise<AppVersion | null> {
  const [rows] = await getPool().execute<AppVersionRow[]>(
    `${SELECT_APP_VERSIONS} ORDER BY id DESC LIMIT 1`,
  );
  return rows.length > 0 ? toAppVersion(rows[0]) : null;
}

/** id 로 한 줄 찾기. 없으면 null */
export async function findById(id: number): Promise<AppVersion | null> {
  const [rows] = await getPool().execute<AppVersionRow[]>(`${SELECT_APP_VERSIONS} WHERE id = ?`, [
    id,
  ]);
  return rows.length > 0 ? toAppVersion(rows[0]) : null;
}

/** 버전 문자열로 한 줄 찾기 (중복 확인용). 없으면 null */
export async function findByVersion(version: string): Promise<AppVersion | null> {
  const [rows] = await getPool().execute<AppVersionRow[]>(
    `${SELECT_APP_VERSIONS} WHERE version = ? LIMIT 1`,
    [version],
  );
  return rows.length > 0 ? toAppVersion(rows[0]) : null;
}

/** 새 줄을 넣고, MySQL이 만든 id 를 돌려줘요 */
export async function insert(values: { version: string; forceUpdate: boolean }): Promise<number> {
  const [result] = await getPool().execute<ResultSetHeader>(
    'INSERT INTO app_versions (version, force_update) VALUES (?, ?)',
    [values.version, values.forceUpdate],
  );
  return result.insertId;
}

/** 한 줄의 값을 바꿔요. updated_at 은 MySQL이 알아서 지금 시각으로 바꿔요 */
export async function update(
  id: number,
  values: { version: string; forceUpdate: boolean },
): Promise<void> {
  await getPool().execute('UPDATE app_versions SET version = ?, force_update = ? WHERE id = ?', [
    values.version,
    values.forceUpdate,
    id,
  ]);
}
