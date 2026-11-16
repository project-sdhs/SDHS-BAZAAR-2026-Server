import { describe, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface PushTokenRow extends RowDataPacket {
  id: number;
  user_id: number;
  platform: string;
  token: string;
  order_alerts_enabled: number;
  last_seen_at: Date | string | null;
}

describe('Push Token DB 테스트', () => {
  it('푸시 토큰 저장, 설정 변경 및 Soft Delete', async () => {
    const pool = getPool();

    let userId: number | null = null;
    let pushTokenId: number | null = null;

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      // 1. 테스트 사용자 생성
      const [userResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users
            (auth_provider, auth_subject, email)
           VALUES (?, ?, ?)`,
        ['google', `push-test-${unique}`, `push-${unique}@example.test`],
      );

      userId = userResult.insertId;

      // 2. 푸시 토큰 저장
      const token = `test-push-token-${unique}`;

      const [pushResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO push_tokens
            (user_id, platform, token,
             order_alerts_enabled, last_seen_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
        [userId, 'android', token, 1],
      );

      pushTokenId = pushResult.insertId;

      // 3. 저장된 토큰 조회
      const [rows] = await pool.execute<PushTokenRow[]>(
        `SELECT id, user_id, platform, token,
                order_alerts_enabled, last_seen_at
         FROM push_tokens
         WHERE id = ? AND deleted_at IS NULL`,
        [pushTokenId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.user_id).toBe(userId);
      expect(rows[0]?.platform).toBe('android');
      expect(rows[0]?.token).toBe(token);
      expect(rows[0]?.order_alerts_enabled).toBe(1);
      expect(rows[0]?.last_seen_at).not.toBeNull();

      // 4. 주문 알림 비활성화
      await pool.execute(
        `UPDATE push_tokens
         SET order_alerts_enabled = 0
         WHERE id = ?`,
        [pushTokenId],
      );

      const [updatedRows] = await pool.execute<PushTokenRow[]>(
        `SELECT id, user_id, platform, token,
                  order_alerts_enabled, last_seen_at
           FROM push_tokens
           WHERE id = ?`,
        [pushTokenId],
      );

      expect(updatedRows[0]?.order_alerts_enabled).toBe(0);

      // 5. Soft Delete
      await pool.execute(
        `UPDATE push_tokens
         SET deleted_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [pushTokenId],
      );

      const [deletedRows] = await pool.execute<PushTokenRow[]>(
        `SELECT id, user_id, platform, token,
                  order_alerts_enabled, last_seen_at
           FROM push_tokens
           WHERE id = ? AND deleted_at IS NULL`,
        [pushTokenId],
      );

      expect(deletedRows).toHaveLength(0);
    } finally {
      // 자식 테이블을 먼저 정리
      if (pushTokenId !== null) {
        await pool.execute('DELETE FROM push_tokens WHERE id = ?', [pushTokenId]);
      }

      if (userId !== null) {
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
      }
    }
  });

  it('존재하지 않는 사용자 ID는 FK가 차단한다', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await expect(
      getPool().execute(
        `INSERT INTO push_tokens
          (user_id, platform, token)
         VALUES (?, ?, ?)`,
        ['18446744073709551615', 'android', `invalid-token-${unique}`],
      ),
    ).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
  });
});
