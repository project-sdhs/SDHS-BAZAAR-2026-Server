import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { ClassTeacher } from '../models/class-teacher.model.js';

interface ClassTeacherRow extends RowDataPacket {
  id: number;
  class_id: number;
  school_member_id: number;
  is_homeroom: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toClassTeacher(row: ClassTeacherRow): ClassTeacher {
  return {
    id: row.id,
    classId: row.class_id,
    schoolMemberId: row.school_member_id,
    isHomeroom: row.is_homeroom === 1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// 특정 반의 담당 선생님 조회
export async function findByClassId(classId: number): Promise<ClassTeacher[]> {
  const [rows] = await getPool().execute<ClassTeacherRow[]>(
    `SELECT *
     FROM class_teachers
     WHERE class_id = ?
       AND deleted_at IS NULL
     ORDER BY is_homeroom DESC, id`,
    [classId],
  );

  return rows.map(toClassTeacher);
}

// 특정 선생님이 담당하는 반 조회
export async function findBySchoolMemberId(schoolMemberId: number): Promise<ClassTeacher[]> {
  const [rows] = await getPool().execute<ClassTeacherRow[]>(
    `SELECT *
     FROM class_teachers
     WHERE school_member_id = ?
       AND deleted_at IS NULL
     ORDER BY class_id`,
    [schoolMemberId],
  );

  return rows.map(toClassTeacher);
}

// ID로 담당 관계 조회
export async function findById(id: number): Promise<ClassTeacher | null> {
  const [rows] = await getPool().execute<ClassTeacherRow[]>(
    `SELECT *
     FROM class_teachers
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toClassTeacher(rows[0]) : null;
}
