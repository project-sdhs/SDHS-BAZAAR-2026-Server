import { describe, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface TokenRow extends RowDataPacket {
  id: number;
  user_id: number;
  token_hash: string;
  platform: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  revoked_reason: string | null;
}

describe('Refresh Token DB 테스트', () => {
  it('토큰 생성, 조회, 폐기 및 정리', async () => {
    const pool = getPool();

    let userId: number | null = null;
    let tokenId: number | null = null;

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      // 1. 테스트 사용자 생성
      const [userResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users
            (auth_provider, auth_subject, email)
           VALUES (?, ?, ?)`,
        ['google', `refresh-test-${unique}`, `refresh-${unique}@example.test`],
      );

      userId = userResult.insertId;

      // 2. 테스트용 토큰 해시 생성
      const tokenHash = 'a'.repeat(64);
      const expiresAt = '2030-01-01 00:00:00';

      const [tokenResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO refresh_tokens
            (user_id, token_hash, platform, expires_at)
           VALUES (?, ?, ?, ?)`,
        [userId, tokenHash, 'web', expiresAt],
      );

      tokenId = tokenResult.insertId;

      // 3. 저장된 토큰 조회
      const [rows] = await pool.execute<TokenRow[]>(
        `SELECT *
         FROM refresh_tokens
         WHERE id = ?`,
        [tokenId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.user_id).toBe(userId);
      expect(rows[0]?.token_hash).toBe(tokenHash);
      expect(rows[0]?.revoked_at).toBeNull();
      expect(rows[0]?.expires_at).toBeTruthy();

      // 4. 토큰 폐기
      await pool.execute(
        `UPDATE refresh_tokens
         SET revoked_at = CURRENT_TIMESTAMP(3),
             revoked_reason = ?
         WHERE id = ?`,
        ['logout', tokenId],
      );

      // 5. 폐기 여부 확인
      const [revokedRows] = await pool.execute<TokenRow[]>(
        `SELECT *
           FROM refresh_tokens
           WHERE id = ?`,
        [tokenId],
      );

      expect(revokedRows[0]?.revoked_at).not.toBeNull();
      expect(revokedRows[0]?.revoked_reason).toBe('logout');
    } finally {
      // FK 순서에 따라 토큰부터 정리
      if (tokenId !== null) {
        await pool.execute('DELETE FROM refresh_tokens WHERE id = ?', [tokenId]);
      }

      if (userId !== null) {
        await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
      }
    }
  });

  it('존재하지 않는 사용자 ID는 FK가 거부한다', async () => {
    await expect(
      getPool().execute(
        `INSERT INTO refresh_tokens
          (user_id, token_hash, platform, expires_at)
         VALUES (?, ?, ?, ?)`,
        ['18446744073709551615', 'b'.repeat(64), 'web', '2030-01-01 00:00:00'],
      ),
    ).rejects.toMatchObject({
      code: 'ER_NO_REFERENCED_ROW_2',
    });
  });
});
