import type { RowDataPacket } from 'mysql2';

import { getPool } from '../db/pool.js';
import type { PublicSettingsData } from '../models/public-settings.model.js';

interface PublicSettingsRow extends RowDataPacket {
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

function toSafeAmount(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) {
    // DB 값이나 계좌 정보는 에러 메시지에 넣지 않아요.
    throw new Error('공개 설정의 금액이 JavaScript 안전 정수 범위를 벗어났습니다.');
  }
  return amount;
}

/** DB 한 줄을 공개 응답의 이름과 자료형으로 바꿔요. */
function toPublicSettings(row: PublicSettingsRow): PublicSettingsData {
  return {
    appOpen: row.app_open === 1,
    eventName: row.event_name,
    eventStartDate: row.event_start_date,
    eventEndDate: row.event_end_date,
    depositAccount:
      row.bank_name !== null && row.account_no !== null && row.holder_name !== null
        ? { bank: row.bank_name, accountNo: row.account_no, holder: row.holder_name }
        : null,
    depositorNameRule: row.depositor_name_rule,
    depositorNameRuleWithCode: row.depositor_name_rule_with_code,
    chargeMin: toSafeAmount(row.charge_min),
    chargeMax: row.charge_max === null ? null : toSafeAmount(row.charge_max),
    balanceLimit: row.balance_limit === null ? null : toSafeAmount(row.balance_limit),
  };
}

/** 살아 있는 설정 하나와 삭제되지 않은 입금 계좌만 읽어요. 없으면 null. */
export async function findPublicSettings(): Promise<PublicSettingsData | null> {
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

  return rows[0] ? toPublicSettings(rows[0]) : null;
}
