import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { PushToken, PushTokenPlatform } from '../models/push-token.model.js';

interface PushTokenRow extends RowDataPacket {
  id: number;
  user_id: number;
  platform: PushTokenPlatform;
  token: string;
  order_alerts_enabled: number;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toPushToken(row: PushTokenRow): PushToken {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    token: row.token,
    orderAlertsEnabled: row.order_alerts_enabled === 1,
    lastSeenAt: row.last_seen_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// 사용자가 등록한 활성 기기 조회
export async function findByUserId(userId: number): Promise<PushToken[]> {
  const [rows] = await getPool().execute<PushTokenRow[]>(
    `SELECT *
     FROM push_tokens
     WHERE user_id = ?
       AND deleted_at IS NULL
     ORDER BY last_seen_at DESC`,
    [userId],
  );

  return rows.map(toPushToken);
}

// ID로 기기 등록 정보 조회
export async function findById(id: number): Promise<PushToken | null> {
  const [rows] = await getPool().execute<PushTokenRow[]>(
    `SELECT *
     FROM push_tokens
     WHERE id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );

  return rows.length > 0 ? toPushToken(rows[0]) : null;
}
