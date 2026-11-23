import { describe, expect, it } from 'vitest';
import type { ResultSetHeader } from 'mysql2';

import { getPool } from '../../src/db/pool.js';
import { findByEmail, findById } from '../../src/repositories/school-member.repository.js';

describe('School Member Repository DB 테스트', () => {
  it('학생 명부 저장, 조회 및 Soft Delete', async () => {
    const pool = getPool();

    let classId: number | null = null;
    let memberId: number | null = null;

    try {
      // 1. 반 생성
      const [classResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO classes (grade, class_no)
         VALUES (?, ?)`,
        [2, 99],
      );

      classId = classResult.insertId;

      // 2. 학생 생성
      const email = `student-${classId}@example.test`;

      const [memberResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO school_members
          (email, name, member_type, class_id,
           student_no, is_class_leader, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [email, '테스트 학생', 'student', classId, '2099', 1, 'manual'],
      );

      memberId = memberResult.insertId;

      // 3. ID로 조회
      const member = await findById(memberId);

      expect(member).not.toBeNull();
      expect(member?.email).toBe(email);
      expect(member?.memberType).toBe('student');
      expect(member?.classId).toBe(classId);
      expect(member?.isClassLeader).toBe(true);

      // 4. 이메일로 조회
      const foundByEmail = await findByEmail(email.toUpperCase());

      expect(foundByEmail?.id).toBe(memberId);

      // 5. Soft Delete
      await pool.execute(
        `UPDATE school_members
         SET deleted_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [memberId],
      );

      expect(await findById(memberId)).toBeNull();
      expect(await findByEmail(email)).toBeNull();
    } finally {
      // 자식 테이블부터 삭제
      if (memberId !== null) {
        await pool.execute('DELETE FROM school_members WHERE id = ?', [memberId]);
      }

      if (classId !== null) {
        await pool.execute('DELETE FROM classes WHERE id = ?', [classId]);
      }
    }
  });

  it('존재하지 않는 반을 참조하면 FK 오류 발생', async () => {
    const missingClassId = '18446744073709551615';

    await expect(
      getPool().execute(
        `INSERT INTO school_members
          (email, member_type, class_id, source)
         VALUES (?, ?, ?, ?)`,
        ['invalid-class@example.test', 'student', missingClassId, 'manual'],
      ),
    ).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
  });

  it('존재하지 않는 이메일은 null 반환', async () => {
    const result = await findByEmail('not-found@example.test');

    expect(result).toBeNull();
  });
});
