import { describe, expect, it } from 'vitest';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import { getPool } from '../../src/db/pool.js';

interface SyncRunRow extends RowDataPacket {
  id: number;
  started_by_admin_id: number;
  status: string;
  finished_at: Date | string | null;
  result_summary: unknown;
  error_message: string | null;
}

describe('Google Group Sync Run DB 테스트', () => {
  it('동기화 시작, 성공, 실패 상태를 저장한다', async () => {
    const pool = getPool();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let adminId: number | null = null;
    let syncRunId: number | null = null;

    try {
      // 1. 테스트 관리자 계정 생성
      const [adminResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO admin_accounts
            (email, name, role, scope_all)
           VALUES (?, ?, ?, ?)`,
        [`sync-admin-${unique}@example.test`, '동기화 테스트 관리자', 'admin', 1],
      );

      adminId = adminResult.insertId;

      // 2. 동기화 작업 시작
      const [syncResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO google_group_sync_runs
            (started_by_admin_id, status)
           VALUES (?, ?)`,
        [adminId, 'running'],
      );

      syncRunId = syncResult.insertId;

      // 3. 초기 상태 확인
      const [runningRows] = await pool.execute<SyncRunRow[]>(
        `SELECT *
           FROM google_group_sync_runs
           WHERE id = ?`,
        [syncRunId],
      );

      expect(runningRows).toHaveLength(1);
      expect(runningRows[0]?.status).toBe('running');
      expect(runningRows[0]?.started_by_admin_id).toBe(adminId);
      expect(runningRows[0]?.finished_at).toBeNull();

      // 4. 동기화 성공 처리
      const summary = {
        total: 20,
        created: 5,
        updated: 15,
      };

      await pool.execute(
        `UPDATE google_group_sync_runs
         SET status = ?,
             finished_at = CURRENT_TIMESTAMP(3),
             result_summary = ?
         WHERE id = ?`,
        ['succeeded', JSON.stringify(summary), syncRunId],
      );

      const [successRows] = await pool.execute<SyncRunRow[]>(
        `SELECT *
           FROM google_group_sync_runs
           WHERE id = ?`,
        [syncRunId],
      );

      expect(successRows[0]?.status).toBe('succeeded');
      expect(successRows[0]?.finished_at).not.toBeNull();

      // mysql2 설정에 따라 JSON은 객체 또는 문자열

      const rawSummary: unknown = successRows[0]?.result_summary;

      const savedSummary: unknown =
        typeof rawSummary === 'string' ? (JSON.parse(rawSummary) as unknown) : rawSummary;

      expect(savedSummary).toEqual(summary);

      expect(savedSummary).toEqual(summary);

      // 5. 실패 기록으로 변경해 저장 동작 검증
      await pool.execute(
        `UPDATE google_group_sync_runs
         SET status = ?,
             error_message = ?
         WHERE id = ?`,
        ['failed', '테스트용 동기화 오류', syncRunId],
      );

      const [failedRows] = await pool.execute<SyncRunRow[]>(
        `SELECT *
           FROM google_group_sync_runs
           WHERE id = ?`,
        [syncRunId],
      );

      expect(failedRows[0]?.status).toBe('failed');
      expect(failedRows[0]?.error_message).toBe('테스트용 동기화 오류');
    } finally {
      // 자식 테이블부터 정리
      if (syncRunId !== null) {
        await pool.execute(
          `DELETE FROM google_group_sync_runs
           WHERE id = ?`,
          [syncRunId],
        );
      }

      if (adminId !== null) {
        await pool.execute(
          `DELETE FROM admin_accounts
           WHERE id = ?`,
          [adminId],
        );
      }
    }
  });
});
