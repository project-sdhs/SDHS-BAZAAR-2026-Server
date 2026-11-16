import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type {
  RefreshToken,
  RefreshTokenPlatform,
  RefreshTokenRevokedReason,
} from '../models/refresh-token.model.js';

interface RefreshTokenRow extends RowDataPacket {
  id: number;
  user_id: number;
  token_hash: string;
  platform: RefreshTokenPlatform | null;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: RefreshTokenRevokedReason | null;
  replaced_by_id: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toRefreshToken(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    platform: row.platform,
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    revokedReason: row.revoked_reason,
    replacedById: row.replaced_by_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// ID로 토큰 기록 조회
export async function findById(id: number): Promise<RefreshToken | null> {
  const [rows] = await getPool().execute<RefreshTokenRow[]>(
    `SELECT *
     FROM refresh_tokens
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toRefreshToken(rows[0]) : null;
}

// SHA-256 해시로 토큰 기록 조회
export async function findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
  const [rows] = await getPool().execute<RefreshTokenRow[]>(
    `SELECT *
     FROM refresh_tokens
     WHERE token_hash = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [tokenHash],
  );

  return rows.length > 0 ? toRefreshToken(rows[0]) : null;
}

// 특정 사용자의 토큰 기록 조회
export async function findByUserId(userId: number): Promise<RefreshToken[]> {
  const [rows] = await getPool().execute<RefreshTokenRow[]>(
    `SELECT *
     FROM refresh_tokens
     WHERE user_id = ?
       AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [userId],
  );

  return rows.map(toRefreshToken);
}
