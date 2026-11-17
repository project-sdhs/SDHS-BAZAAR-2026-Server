import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

import { getPool } from '../db/pool.js';
import type {
  AuditAction,
  AuditActor,
  AuditActorRole,
  AuditLog,
  AuditLogInput,
  AuditTargetType,
} from '../models/audit-log.model.js';

/** 칼럼 길이 (023 마이그레이션) */
const REASON_MAX_LENGTH = 200;
const REQUEST_ID_MAX_LENGTH = 64;

interface AuditLogRow extends RowDataPacket {
  id: number;
  actor_type: AuditActor['type'];
  actor_admin_id: number | null;
  actor_user_id: number | null;
  actor_role: AuditActorRole;
  action: AuditAction;
  target_type: AuditTargetType | null;
  target_id: number | null;
  booth_id: number | null;
  before_value: unknown;
  after_value: unknown;
  reason: string | null;
  request_id: string | null;
  created_at: Date;
}

function toAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    actorType: row.actor_type,
    actorAdminId: row.actor_admin_id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    boothId: row.booth_id,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    reason: row.reason,
    requestId: row.request_id,
    createdAt: row.created_at.toISOString(),
  };
}

/** JSON 칼럼에 넣을 값. 없으면(undefined · null) NULL 로 저장해요. */
function toJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

/** 칼럼 길이를 넘으면 잘라요. (기록 때문에 원래 작업이 실패하지 않게) */
function fit(value: string | undefined, maxLength: number): string | null {
  return value === undefined ? null : value.slice(0, maxLength);
}

/**
 * 관리 기록을 남겨요. 꼭 withTransaction 안에서, 원래 작업과 같은 connection 으로 불러요.
 * 원래 작업이 롤백되면 기록도 같이 사라지고, 기록이 실패하면 원래 작업도 롤백돼요.
 *
 * @example
 * await withTransaction(async (connection) => {
 *   await connection.execute('UPDATE users SET credit_balance = ? WHERE id = ?', [after, userId]);
 *   await insertAuditLog(connection, {
 *     actor: { type: 'admin_account', adminId, role: 'admin' },
 *     action: 'credit.adjust',
 *     target: { type: 'users', id: userId },
 *     before: { creditBalance: before },
 *     after: { creditBalance: after },
 *     reason: '현장 환불',
 *     requestId: typeof req.id === 'string' ? req.id : undefined,
 *   });
 * });
 */
export async function insertAuditLog(
  connection: PoolConnection,
  input: AuditLogInput,
): Promise<number> {
  const { actor } = input;

  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO audit_logs
       (actor_type, actor_admin_id, actor_user_id, actor_role, action,
        target_type, target_id, booth_id, before_value, after_value, reason, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor.type,
      actor.type === 'admin_account' ? actor.adminId : null,
      actor.type === 'user' ? actor.userId : null,
      actor.type === 'system' ? 'system' : actor.role,
      input.action,
      input.target?.type ?? null,
      input.target?.id ?? null,
      input.boothId ?? null,
      toJson(input.before),
      toJson(input.after),
      fit(input.reason, REASON_MAX_LENGTH),
      fit(input.requestId, REQUEST_ID_MAX_LENGTH),
    ],
  );

  return result.insertId;
}

/** 특정 대상의 관리 기록 (최근 순). 백오피스에서 "이 회원의 변경 기록" 같은 화면에 써요. */
export async function findByTarget(
  targetType: AuditTargetType,
  targetId: number,
): Promise<AuditLog[]> {
  const [rows] = await getPool().execute<AuditLogRow[]>(
    `SELECT *
     FROM audit_logs
     WHERE target_type = ?
       AND target_id = ?
       AND deleted_at IS NULL
     ORDER BY id DESC`,
    [targetType, targetId],
  );

  return rows.map(toAuditLog);
}
