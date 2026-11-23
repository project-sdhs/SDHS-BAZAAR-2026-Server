import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';

export interface BoardDevice {
  id: number;
  boothId: number;
  revokedAt: Date | null;
}

interface BoardDeviceRow extends RowDataPacket {
  id: number;
  booth_id: number;
  revoked_at: Date | null;
}

/** 해시로 메뉴판 기기를 찾아요. 폐기된 기기도 BOARD_REPLACED 응답을 위해 조회해요. */
export async function findByTokenHash(tokenHash: string): Promise<BoardDevice | null> {
  const [rows] = await getPool().execute<BoardDeviceRow[]>(
    'SELECT id, booth_id, revoked_at FROM board_devices WHERE token_hash = ? AND deleted_at IS NULL LIMIT 1',
    [tokenHash],
  );
  const row = rows[0];

  return row ? { id: row.id, boothId: row.booth_id, revokedAt: row.revoked_at } : null;
}

/** 메뉴판의 마지막 확인 시각을 최대 60초에 한 번만 갱신해요. */
export async function touchLastSeen(id: number): Promise<void> {
  await getPool().execute(
    `UPDATE board_devices
     SET last_seen_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?
       AND revoked_at IS NULL
       AND deleted_at IS NULL
       AND last_seen_at <= CURRENT_TIMESTAMP(3) - INTERVAL 60 SECOND`,
    [id],
  );
}
