import type { PublicSettings } from '../models/public-settings.model.js';
import * as publicSettingsRepository from '../repositories/public-settings.repository.js';
import { HttpError } from '../utils/http-error.js';

function toSafeAmount(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) {
    // DB 값이나 계좌 정보는 에러 메시지에 넣지 않아요.
    throw new Error('공개 설정의 금액이 JavaScript 안전 정수 범위를 벗어났습니다.');
  }
  return amount;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const settings = await publicSettingsRepository.findPublicSettings();
  if (!settings) {
    throw new HttpError(404, 'NOT_FOUND', '등록된 바자회 설정이 없습니다.');
  }

  return {
    appOpen: settings.app_open === 1,
    eventName: settings.event_name,
    eventStartDate: settings.event_start_date,
    eventEndDate: settings.event_end_date,
    depositAccount:
      settings.bank_name !== null && settings.account_no !== null && settings.holder_name !== null
        ? {
            bank: settings.bank_name,
            accountNo: settings.account_no,
            holder: settings.holder_name,
          }
        : null,
    depositorNameRule: settings.depositor_name_rule,
    depositorNameExample: '2205 이재원',
    depositorNameRuleWithCode: settings.depositor_name_rule_with_code,
    depositorNameExampleWithCode: 'V3071 김하린',
    chargeMin: toSafeAmount(settings.charge_min),
    chargeMax: settings.charge_max === null ? null : toSafeAmount(settings.charge_max),
    balanceLimit: settings.balance_limit === null ? null : toSafeAmount(settings.balance_limit),
  };
}
