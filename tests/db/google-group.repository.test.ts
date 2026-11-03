import { describe, expect, it } from 'vitest';
import type { ResultSetHeader } from 'mysql2';

import { getPool } from '../../src/db/pool.js';
import { findAll, findById } from '../../src/repositories/google-group.repository.js';

describe('Google Group Repository DB 테스트', () => {
  it('그룹을 저장하고 조회하며 Soft Delete를 확인한다', async () => {
    const pool = getPool();
    let classId: number | null = null;
    let groupId: number | null = null;

    try {
      // 1. FK가 참조할 반을 먼저 생성
      const [classResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO classes (grade, class_no)
         VALUES (?, ?)`,
        [2, 99],
      );

      classId = classResult.insertId;

      // 2. Google 그룹 생성
      const email = `test-${classId}@example.test`;

      const [groupResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO google_groups
           (group_email, group_type, class_id)
         VALUES (?, ?, ?)`,
        [email, 'class', classId],
      );

      groupId = groupResult.insertId;

      // 3. Repository로 조회
      const group = await findById(groupId);

      expect(group).not.toBeNull();
      expect(group?.groupEmail).toBe(email);
      expect(group?.groupType).toBe('class');
      expect(group?.classId).toBe(classId);

      // 4. 전체 조회에도 포함되는지 확인
      const groups = await findAll();

      expect(groups.some((item) => item.id === groupId)).toBe(true);

      // 5. Soft Delete 처리
      await pool.execute(
        `UPDATE google_groups
         SET deleted_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [groupId],
      );

      // 6. 삭제된 그룹이 조회되지 않는지 확인
      expect(await findById(groupId)).toBeNull();
    } finally {
      // FK 순서에 맞춰 자식 테이블부터 정리
      if (groupId !== null) {
        await pool.execute('DELETE FROM google_groups WHERE id = ?', [groupId]);
      }

      if (classId !== null) {
        await pool.execute('DELETE FROM classes WHERE id = ?', [classId]);
      }
    }
  });

  it('존재하지 않는 반을 참조하는 그룹은 등록할 수 없다', async () => {
    // BIGINT UNSIGNED 범위 안의 매우 큰 미사용 ID
    const missingClassId = '18446744073709551615';

    await expect(
      getPool().execute(
        `INSERT INTO google_groups
           (group_email, group_type, class_id)
         VALUES (?, ?, ?)`,
        ['invalid-fk@example.test', 'class', missingClassId],
      ),
    ).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
  });
});
