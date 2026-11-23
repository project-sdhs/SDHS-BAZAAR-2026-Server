import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { SchoolClass } from '../models/class.model.js';

// MySQL 조회 결과의 데이터 구조
interface ClassRow extends RowDataPacket {
  id: number;
  grade: number;
  class_no: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// MySQL 결과를 TypeScript 모델로 변환
function toSchoolClass(row: ClassRow): SchoolClass {
  return {
    id: row.id,
    grade: row.grade,
    classNo: row.class_no,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// 삭제되지 않은 모든 반 조회
export async function findAll(): Promise<SchoolClass[]> {
  const [rows] = await getPool().execute<ClassRow[]>(
    `SELECT id, grade, class_no,
            created_at, updated_at, deleted_at
     FROM classes
     WHERE deleted_at IS NULL
     ORDER BY grade, class_no`,
  );

  return rows.map(toSchoolClass);
}

// ID로 반 하나 조회
export async function findById(id: number): Promise<SchoolClass | null> {
  const [rows] = await getPool().execute<ClassRow[]>(
    `SELECT id, grade, class_no,
            created_at, updated_at, deleted_at
     FROM classes
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toSchoolClass(rows[0]) : null;
}
