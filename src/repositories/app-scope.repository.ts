import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';

interface ClassBoothRow extends RowDataPacket {
  id: number;
  class_id: number;
}

interface CashierBoothRow extends RowDataPacket {
  booth_id: number;
}

export interface ClassBooth {
  boothId: number;
  classId: number;
}

/** 반들의 부스 (반장 · 담당 선생님이 운영하는 부스). 삭제된 부스는 빼요. */
export async function findBoothsByClassIds(classIds: readonly number[]): Promise<ClassBooth[]> {
  if (classIds.length === 0) {
    return [];
  }

  // IN (?, ?, …): 값 개수만큼 자리만 만들고, 값은 그대로 ? 에 넣어요. (SQL 인젝션 방지)
  const placeholders = classIds.map(() => '?').join(', ');
  const [rows] = await getPool().execute<ClassBoothRow[]>(
    `SELECT id, class_id
     FROM booths
     WHERE class_id IN (${placeholders})
       AND deleted_at IS NULL
     ORDER BY id`,
    [...classIds],
  );

  return rows.map((row) => ({ boothId: row.id, classId: row.class_id }));
}

/** 이 회원이 캐셔로 지정된 부스 id. 지정이 취소됐거나 삭제된 부스는 빼요. */
export async function findCashierBoothIds(userId: number): Promise<number[]> {
  const [rows] = await getPool().execute<CashierBoothRow[]>(
    `SELECT DISTINCT bc.booth_id
     FROM booth_cashiers bc
     JOIN booths b ON b.id = bc.booth_id
     WHERE bc.user_id = ?
       AND bc.deleted_at IS NULL
       AND b.deleted_at IS NULL
     ORDER BY bc.booth_id`,
    [userId],
  );

  return rows.map((row) => row.booth_id);
}
