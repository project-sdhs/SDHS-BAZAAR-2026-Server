import { describe, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface ClassTeacherRow extends RowDataPacket {
  id: number;
  class_id: number;
  school_member_id: number;
  is_homeroom: number;
}

describe('Class Teacher DB 테스트', () => {
  it('반과 선생님 연결 및 Soft Delete', async () => {
    const pool = getPool();

    let classId: number | null = null;
    let memberId: number | null = null;
    let teacherId: number | null = null;

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      // 1. 테스트 반 생성
      const [classResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO classes (grade, class_no)
           VALUES (?, ?)`,
        [2, 99],
      );

      classId = classResult.insertId;

      // 2. 테스트 선생님 생성
      const [memberResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO school_members
            (email, name, member_type, source)
           VALUES (?, ?, ?, ?)`,
        [`teacher-${unique}@example.test`, '테스트 선생님', 'teacher', 'manual'],
      );

      memberId = memberResult.insertId;

      // 3. 반과 선생님 연결
      const [teacherResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO class_teachers
            (class_id, school_member_id, is_homeroom)
           VALUES (?, ?, ?)`,
        [classId, memberId, 1],
      );

      teacherId = teacherResult.insertId;

      // 4. JOIN으로 관계 확인
      const [rows] = await pool.execute<ClassTeacherRow[]>(
        `SELECT ct.id,
                  ct.class_id,
                  ct.school_member_id,
                  ct.is_homeroom
           FROM class_teachers ct
           INNER JOIN classes c
             ON ct.class_id = c.id
           INNER JOIN school_members sm
             ON ct.school_member_id = sm.id
           WHERE ct.id = ?
             AND ct.deleted_at IS NULL
             AND c.deleted_at IS NULL
             AND sm.deleted_at IS NULL`,
        [teacherId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.class_id).toBe(classId);
      expect(rows[0]?.school_member_id).toBe(memberId);
      expect(rows[0]?.is_homeroom).toBe(1);

      // 5. Soft Delete
      await pool.execute(
        `UPDATE class_teachers
         SET deleted_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [teacherId],
      );

      // 6. 삭제된 관계는 일반 조회에서 제외
      const [deletedRows] = await pool.execute<ClassTeacherRow[]>(
        `SELECT id, class_id,
                  school_member_id, is_homeroom
           FROM class_teachers
           WHERE id = ?
             AND deleted_at IS NULL`,
        [teacherId],
      );

      expect(deletedRows).toHaveLength(0);
    } finally {
      // 자식 → 부모 순서로 정리
      if (teacherId !== null) {
        await pool.execute('DELETE FROM class_teachers WHERE id = ?', [teacherId]);
      }

      if (memberId !== null) {
        await pool.execute('DELETE FROM school_members WHERE id = ?', [memberId]);
      }

      if (classId !== null) {
        await pool.execute('DELETE FROM classes WHERE id = ?', [classId]);
      }
    }
  });

  it('존재하지 않는 선생님 ID는 FK가 차단한다', async () => {
    const pool = getPool();
    let classId: number | null = null;

    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO classes (grade, class_no)
         VALUES (?, ?)`,
        [2, 98],
      );

      classId = result.insertId;

      await expect(
        pool.execute(
          `INSERT INTO class_teachers
            (class_id, school_member_id, is_homeroom)
           VALUES (?, ?, ?)`,
          [classId, '18446744073709551615', 0],
        ),
      ).rejects.toMatchObject({
        code: 'ER_NO_REFERENCED_ROW_2',
      });
    } finally {
      if (classId !== null) {
        await pool.execute('DELETE FROM classes WHERE id = ?', [classId]);
      }
    }
  });
});
