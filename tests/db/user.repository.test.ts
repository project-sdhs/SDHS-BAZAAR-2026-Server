import { describe, expect, it } from 'vitest';
import type { ResultSetHeader } from 'mysql2';

import { getPool } from '../../src/db/pool.js';
import { findById } from '../../src/repositories/user.repository.js';

describe('User Repository DB 테스트', () => {
  it('사용자 저장, 조회 및 Soft Delete', async () => {
    const pool = getPool();

    let memberId: number | null = null;
    let userId: number | null = null;

    try {
      // 1. 테스트용 학교 구성원 생성
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const email = `user-${unique}@example.test`;

      const [memberResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO school_members
            (email, name, member_type, source)
           VALUES (?, ?, ?, ?)`,
        [`member-${unique}@example.test`, '테스트 구성원', 'student', 'manual'],
      );

      memberId = memberResult.insertId;

      // 2. 로그인 사용자 생성
      const [userResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users
            (auth_provider, auth_subject, email,
             name, school_member_id)
           VALUES (?, ?, ?, ?, ?)`,
        ['google', `test-subject-${unique}`, email, '테스트 사용자', memberId],
      );

      userId = userResult.insertId;

      // 3. Repository로 사용자 조회
      const user = await findById(userId);

      expect(user).not.toBeNull();
      expect(user?.id).toBe(userId);
      expect(user?.email).toBe(email);
      expect(user?.authProvider).toBe('google');
      expect(user?.schoolMemberId).toBe(memberId);

      // 4. Soft Delete
      await pool.execute(
        `UPDATE users
         SET deleted_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [userId],
      );

      // 5. 일반 조회에서 제외되는지 확인
      expect(await findById(userId)).toBeNull();
    } finally {
      // FK 관계를 고려하여 사용자부터 정리
      if (userId !== null) {
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
      }

      if (memberId !== null) {
        await pool.execute('DELETE FROM school_members WHERE id = ?', [memberId]);
      }
    }
  });

  it('존재하지 않는 사용자 ID는 null 반환', async () => {
    const result = await findById(-1);

    expect(result).toBeNull();
  });

  it('존재하지 않는 학교 구성원 ID는 FK가 차단', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await expect(
      getPool().execute(
        `INSERT INTO users
          (auth_provider, auth_subject, email,
           school_member_id)
         VALUES (?, ?, ?, ?)`,
        [
          'google',
          `invalid-subject-${unique}`,
          `invalid-${unique}@example.test`,
          '18446744073709551615',
        ],
      ),
    ).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
  });
});
