import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';

/**
 * SRV-13: 부스 운영 상태 확인에 필요한 데이터
 */
export interface BoothOperation {
  id: number;
  manualStatus: 'preparing' | 'open' | 'closed';
  orderingPaused: boolean;
  openTime: string;
  closeTime: string;
}

interface BoothOperationRow extends RowDataPacket {
  id: number;
  manual_status: BoothOperation['manualStatus'];
  ordering_paused: number;
  open_time: string;
  close_time: string;
}

/**
 * 삭제되지 않은 부스의 운영 상태를 조회한다.
 * 존재하지 않는 부스는 null을 반환한다.
 */
export async function findBoothOperation(boothId: number): Promise<BoothOperation | null> {
  if (!Number.isSafeInteger(boothId) || boothId <= 0) {
    throw new Error('부스 ID는 양의 정수여야 합니다.');
  }

  const [rows] = await getPool().execute<BoothOperationRow[]>(
    `
    SELECT
      id,
      manual_status,
      ordering_paused,
      TIME_FORMAT(open_time, '%H:%i:%s') AS open_time,
      TIME_FORMAT(close_time, '%H:%i:%s') AS close_time
    FROM booths
    WHERE id = ?
      AND deleted_at IS NULL
    LIMIT 1
    `,
    [boothId],
  );

  const booth = rows[0];

  if (!booth) {
    return null;
  }

  return {
    id: booth.id,
    manualStatus: booth.manual_status,
    orderingPaused: booth.ordering_paused === 1,
    openTime: booth.open_time,
    closeTime: booth.close_time,
  };
}
