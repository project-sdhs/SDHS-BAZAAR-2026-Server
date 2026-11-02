import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { AdminAccount, AdminRole } from '../models/admin-account.model.js';

interface AdminAccountRow extends RowDataPacket {
  id: number;
  email: string;
  name: string | null;
  role: AdminRole;
  scope_all: number;
  can_review_payments: number;
  can_review_charges: number;
  user_id: number | null;
  disabled_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toAdminAccount(row: AdminAccountRow): AdminAccount {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    scopeAll: row.scope_all === 1,
    canReviewPayments: row.can_review_payments === 1,
    canReviewCharges: row.can_review_charges === 1,
    userId: row.user_id,
    disabledAt: row.disabled_at?.toISOString() ?? null,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// 사용 중인 관리자 계정 전체 조회
export async function findAll(): Promise<AdminAccount[]> {
  const [rows] = await getPool().execute<AdminAccountRow[]>(
    `SELECT *
     FROM admin_accounts
     WHERE deleted_at IS NULL
     ORDER BY id`,
  );

  return rows.map(toAdminAccount);
}

// ID로 관리자 계정 조회
export async function findById(id: number): Promise<AdminAccount | null> {
  const [rows] = await getPool().execute<AdminAccountRow[]>(
    `SELECT *
     FROM admin_accounts
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toAdminAccount(rows[0]) : null;
}

// 이메일로 관리자 계정 조회
export async function findByEmail(email: string): Promise<AdminAccount | null> {
  const [rows] = await getPool().execute<AdminAccountRow[]>(
    `SELECT *
     FROM admin_accounts
     WHERE email = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [email.toLowerCase()],
  );

  return rows.length > 0 ? toAdminAccount(rows[0]) : null;
}
