import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';

export interface PublicSettingsRow extends RowDataPacket {
  app_open: number;
  event_name: string;
  event_start_date: string;
  event_end_date: string;
  bank_name: string | null;
  account_no: string | null;
  holder_name: string | null;
  depositor_name_rule: string;
  depositor_name_rule_with_code: string;
  charge_min: string;
  charge_max: string | null;
  balance_limit: string | null;
}

/** 살아 있는 설정 하나와 삭제되지 않은 입금 계좌만 읽어요. 없으면 null. */
export async function findPublicSettings(): Promise<PublicSettingsRow | null> {
  // DATE는 JS Date를 거치지 않아요. BIGINT도 드라이버가 반올림하기 전에 문자열로 받아요.
  const [rows] = await getPool().execute<PublicSettingsRow[]>(
    `SELECT s.app_open, s.event_name,
            DATE_FORMAT(s.event_start_date, '%Y-%m-%d') AS event_start_date,
            DATE_FORMAT(s.event_end_date, '%Y-%m-%d') AS event_end_date,
            d.bank_name, d.account_no, d.holder_name,
            s.depositor_name_rule, s.depositor_name_rule_with_code,
            CAST(s.charge_min AS CHAR) AS charge_min,
            CAST(s.charge_max AS CHAR) AS charge_max,
            CAST(s.balance_limit AS CHAR) AS balance_limit
     FROM bazaar_settings s
     LEFT JOIN deposit_accounts d ON d.id = s.deposit_account_id AND d.deleted_at IS NULL
     WHERE s.deleted_at IS NULL
     ORDER BY s.id DESC
     LIMIT 1`,
  );

  return rows[0] ?? null;
}
