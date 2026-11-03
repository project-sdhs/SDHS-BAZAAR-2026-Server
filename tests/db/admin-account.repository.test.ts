import { describe, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface AdminRow extends RowDataPacket {
  id: number;
  email: string;
  user_id: number | null;
  role: string;
  scope_all: number;
  can_review_payments: number;
  disabled_at: Date | string | null;
  deleted_at: Date | string | null;
}

// DB의 CHECK 제약조건에서 허용하는 역할로 변경
const ADMIN_ROLE = 'admin';

describe('Admin Account DB 테스트', () => {
  it('관리자 생성, 권한 변경 및 비활성화', async () => {
    const pool = getPool();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let userId: number | null = null;
    let adminId: number | null = null;

    try {
      // 1. 테스트 사용자 생성
      const [userResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users
          (auth_provider, auth_subject, email)
         VALUES (?, ?, ?)`,
        ['google', `admin-test-${unique}`, `user-${unique}@example.test`],
      );

      userId = userResult.insertId;

      // 2. 관리자 생성
      const email = `admin-${unique}@example.test`;

      const [adminResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO admin_accounts
          (email, name, role, user_id, scope_all,
           can_review_payments)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, '테스트 관리자', ADMIN_ROLE, userId, 1, 0],
      );

      adminId = adminResult.insertId;

      // 3. 저장 내용 검증
      const [rows] = await pool.execute<AdminRow[]>(
        `SELECT id, email, user_id, role, scope_all,
                can_review_payments, disabled_at, deleted_at
         FROM admin_accounts
         WHERE id = ?`,
        [adminId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe(email);
      expect(rows[0]?.user_id).toBe(userId);
      expect(rows[0]?.role).toBe(ADMIN_ROLE);
      expect(rows[0]?.scope_all).toBe(1);
      expect(rows[0]?.can_review_payments).toBe(0);

      // 4. 결제 검토 권한 부여
      await pool.execute(
        `UPDATE admin_accounts
         SET can_review_payments = 1
         WHERE id = ?`,
        [adminId],
      );

      const [updated] = await pool.execute<AdminRow[]>(
        `SELECT id, email, user_id, role, scope_all,
                can_review_payments, disabled_at, deleted_at
         FROM admin_accounts
         WHERE id = ?`,
        [adminId],
      );

      expect(updated[0]?.can_review_payments).toBe(1);

      // 5. 관리자 비활성화
      await pool.execute(
        `UPDATE admin_accounts
         SET disabled_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [adminId],
      );

      const [disabled] = await pool.execute<AdminRow[]>(
        `SELECT id, email, user_id, role, scope_all,
                can_review_payments, disabled_at, deleted_at
         FROM admin_accounts
         WHERE id = ?`,
        [adminId],
      );

      expect(disabled[0]?.disabled_at).not.toBeNull();

      // 6. Soft Delete
      await pool.execute(
        `UPDATE admin_accounts
         SET deleted_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [adminId],
      );

      const [active] = await pool.execute<AdminRow[]>(
        `SELECT id, email, user_id, role, scope_all,
                can_review_payments, disabled_at, deleted_at
         FROM admin_accounts
         WHERE id = ?
           AND deleted_at IS NULL`,
        [adminId],
      );

      expect(active).toHaveLength(0);
    } finally {
      // FK 순서에 맞게 관리자부터 삭제
      if (adminId !== null) {
        await pool.execute('DELETE FROM admin_accounts WHERE id = ?', [adminId]);
      }

      if (userId !== null) {
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
      }
    }
  });

  it('존재하지 않는 사용자 연결은 FK가 차단한다', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await expect(
      getPool().execute(
        `INSERT INTO admin_accounts
          (email, role, user_id)
         VALUES (?, ?, ?)`,
        [`invalid-admin-${unique}@example.test`, ADMIN_ROLE, '18446744073709551615'],
      ),
    ).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
  });
});
