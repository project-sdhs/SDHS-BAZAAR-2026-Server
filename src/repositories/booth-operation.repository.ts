import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

import { getPool } from '../db/pool.js';

/**
 * SRV-13: 부스 운영 상태
 */
export interface BoothOperation {
  id: number;
  name: string;
  manualStatus: 'preparing' | 'open' | 'closed';
  orderingPaused: boolean;
  pausedAt: string | null;
  openTime: string;
  closeTime: string;
}

interface BoothOperationRow extends RowDataPacket {
  id: number;
  name: string;
  manual_status: BoothOperation['manualStatus'];
  ordering_paused: number;
  paused_at: Date | null;
  open_time: string;
  close_time: string;
}

/**
 * 부스 운영 상태를 조회한다.
 *
 * connection이 없으면 일반 조회.
 * connection이 있으면 FOR UPDATE로 행을 잠근다.
 *
 * FOR UPDATE는 호출자가 시작한 트랜잭션 안에서
 * 사용해야 결제 처리까지 잠금이 유지된다.
 */
export async function findBoothOperation(
  boothId: number,
  connection?: PoolConnection,
): Promise<BoothOperation | null> {
  if (!Number.isSafeInteger(boothId) || boothId <= 0) {
    throw new Error('부스 ID는 양의 정수여야 합니다.');
  }

  const executor = connection ?? getPool();

  const sql = `
    SELECT
      id,
      name,
      manual_status,
      ordering_paused,
      paused_at,
      TIME_FORMAT(open_time, '%H:%i:%s') AS open_time,
      TIME_FORMAT(close_time, '%H:%i:%s') AS close_time
    FROM booths
    WHERE id = ?
      AND deleted_at IS NULL
    LIMIT 1
    ${connection ? 'FOR UPDATE' : ''}
  `;

  const [rows] = await executor.execute<BoothOperationRow[]>(sql, [boothId]);

  const booth = rows[0];

  if (!booth) {
    return null;
  }

  return {
    id: booth.id,
    name: booth.name,
    manualStatus: booth.manual_status,
    orderingPaused: booth.ordering_paused === 1,
    pausedAt: booth.paused_at ? booth.paused_at.toISOString() : null,
    openTime: booth.open_time,
    closeTime: booth.close_time,
  };
}
