import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';

/**
 * SRV-13: 바자회 운영 상태 판단에 필요한 설정
 */
export interface BazaarOperationSettings {
  id: number;
  eventName: string;
  eventStartDate: string;
  eventEndDate: string;
  defaultOpenTime: string;
  defaultCloseTime: string;
  appOpen: boolean;
}

interface BazaarSettingsRow extends RowDataPacket {
  id: number;
  event_name: string;
  event_start_date: string;
  event_end_date: string;
  default_open_time: string;
  default_close_time: string;
  app_open: number;
}

/**
 * 활성 바자회 설정 한 행을 조회한다.
 *
 * DB-10 시드가 활성 설정 행 하나를 생성한다.
 * 설정이 없거나 여러 개라면 운영 상태를 판단하지 않는다.
 */
export async function findActiveSettings(): Promise<BazaarOperationSettings> {
  const [rows] = await getPool().execute<BazaarSettingsRow[]>(`
    SELECT
      id,
      event_name,
      DATE_FORMAT(event_start_date, '%Y-%m-%d') AS event_start_date,
      DATE_FORMAT(event_end_date, '%Y-%m-%d') AS event_end_date,
      TIME_FORMAT(default_open_time, '%H:%i:%s') AS default_open_time,
      TIME_FORMAT(default_close_time, '%H:%i:%s') AS default_close_time,
      app_open
    FROM bazaar_settings
    WHERE deleted_at IS NULL
    LIMIT 2
  `);

  if (rows.length !== 1) {
    throw new Error(`활성 바자회 설정은 정확히 1개여야 합니다. 현재 ${rows.length}개입니다.`);
  }

  const settings = rows[0];

  return {
    id: settings.id,
    eventName: settings.event_name,
    eventStartDate: settings.event_start_date,
    eventEndDate: settings.event_end_date,
    defaultOpenTime: settings.default_open_time,
    defaultCloseTime: settings.default_close_time,
    appOpen: settings.app_open === 1,
  };
}
