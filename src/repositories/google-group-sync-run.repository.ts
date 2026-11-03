import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type {
  GoogleGroupSyncRun,
  GoogleGroupSyncStatus,
} from '../models/google-group-sync-run.model.js';

interface SyncRunRow extends RowDataPacket {
  id: number;
  started_by_admin_id: number;
  status: GoogleGroupSyncStatus;
  finished_at: Date | null;
  result_summary: unknown;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toSyncRun(row: SyncRunRow): GoogleGroupSyncRun {
  return {
    id: row.id,
    startedByAdminId: row.started_by_admin_id,
    status: row.status,
    finishedAt: row.finished_at?.toISOString() ?? null,
    resultSummary:
      typeof row.result_summary === 'string' ? JSON.parse(row.result_summary) : row.result_summary,
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// 삭제되지 않은 동기화 실행 기록 전체 조회
export async function findAll(): Promise<GoogleGroupSyncRun[]> {
  const [rows] = await getPool().execute<SyncRunRow[]>(
    `SELECT *
     FROM google_group_sync_runs
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC, id DESC`,
  );

  return rows.map(toSyncRun);
}

// ID로 동기화 실행 기록 조회
export async function findById(id: number): Promise<GoogleGroupSyncRun | null> {
  const [rows] = await getPool().execute<SyncRunRow[]>(
    `SELECT *
     FROM google_group_sync_runs
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toSyncRun(rows[0]) : null;
}

// 가장 최근 동기화 실행 기록 조회
export async function findLatest(): Promise<GoogleGroupSyncRun | null> {
  const [rows] = await getPool().execute<SyncRunRow[]>(
    `SELECT *
     FROM google_group_sync_runs
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  );

  return rows.length > 0 ? toSyncRun(rows[0]) : null;
}
