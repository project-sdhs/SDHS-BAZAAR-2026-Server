import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { AuthProvider, User } from '../models/user.model.js';

interface UserRow extends RowDataPacket {
  id: number;
  auth_provider: AuthProvider;
  auth_subject: string;
  email: string | null;
  google_hosted_domain: string | null;
  name: string | null;
  school_member_id: number | null;
  verified_at: Date | null;
  verified_by_user_id: number | null;
  verified_by_admin_id: number | null;
  deposit_code: string | null;
  credit_balance: string | number;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toUser(row: UserRow): User {
  const creditBalance = Number(row.credit_balance);

  if (!Number.isSafeInteger(creditBalance)) {
    throw new Error('credit_balance 값이 JavaScript 안전 정수 범위를 초과했습니다.');
  }

  return {
    id: row.id,
    authProvider: row.auth_provider,
    authSubject: row.auth_subject,
    email: row.email,
    googleHostedDomain: row.google_hosted_domain,
    name: row.name,
    schoolMemberId: row.school_member_id,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    verifiedByUserId: row.verified_by_user_id,
    verifiedByAdminId: row.verified_by_admin_id,
    depositCode: row.deposit_code,
    creditBalance,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

export async function findAll(): Promise<User[]> {
  const [rows] = await getPool().execute<UserRow[]>(
    `SELECT *
     FROM users
     WHERE deleted_at IS NULL
     ORDER BY id`,
  );

  return rows.map(toUser);
}

export async function findById(id: number): Promise<User | null> {
  const [rows] = await getPool().execute<UserRow[]>(
    `SELECT *
     FROM users
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toUser(rows[0]) : null;
}

export async function findByAuth(provider: AuthProvider, subject: string): Promise<User | null> {
  const [rows] = await getPool().execute<UserRow[]>(
    `SELECT *
     FROM users
     WHERE auth_provider = ?
       AND auth_subject = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [provider, subject],
  );

  return rows.length > 0 ? toUser(rows[0]) : null;
}
