import { deleteCache, getCache, setCache } from '../db/cache.js';
import type { PublicSettings } from '../models/public-settings.model.js';
import * as publicSettingsRepository from '../repositories/public-settings.repository.js';
import { InternalServerError } from '../utils/http-error.js';

/** getCache · setCache · deleteCache가 공통 접두어를 붙여요. */
export const PUBLIC_SETTINGS_CACHE_KEY = 'settings:public';
const CACHE_TTL_SECONDS = 10;

/** PATCH /admin/settings의 DB 저장 완료 후 호출해요. */
export async function invalidatePublicSettingsCache(): Promise<void> {
  await deleteCache(PUBLIC_SETTINGS_CACHE_KEY);
}

function nameExample(rule: string, samples: Record<string, string>): string {
  return rule.replace(/\{(?:studentNo|name|depositCode)\}/g, (token) => samples[token] ?? token);
}

/** 공개 API와 앱 공개 검사에서 함께 쓸 수 있는 10초 캐시 설정 조회예요. */
export async function getPublicSettings(): Promise<PublicSettings> {
  try {
    const cached = await getCache<PublicSettings>(PUBLIC_SETTINGS_CACHE_KEY);
    if (cached !== null) {
      return cached;
    }
  } catch {
    // Redis를 사용할 수 없어도 공개 설정은 DB에서 읽어요.
  }

  const settings = await publicSettingsRepository.findPublicSettings();
  if (!settings) {
    // 마이그레이션이 보장하는 설정 1행이 없으면 배포/데이터 오류예요.
    throw new InternalServerError();
  }

  const result: PublicSettings = {
    appOpen: settings.appOpen,
    eventName: settings.eventName,
    eventStartDate: settings.eventStartDate,
    eventEndDate: settings.eventEndDate,
    depositAccount: settings.depositAccount,
    depositorNameRule: settings.depositorNameRule,
    depositorNameExample: nameExample(settings.depositorNameRule, {
      '{studentNo}': '2205',
      '{name}': '이재원',
    }),
    depositorNameRuleWithCode: settings.depositorNameRuleWithCode,
    depositorNameExampleWithCode: nameExample(settings.depositorNameRuleWithCode, {
      '{depositCode}': 'V3071',
      '{name}': '김하린',
    }),
    chargeMin: settings.chargeMin,
    chargeMax: settings.chargeMax,
    balanceLimit: settings.balanceLimit,
  };

  try {
    await setCache(PUBLIC_SETTINGS_CACHE_KEY, result, CACHE_TTL_SECONDS);
  } catch {
    // 캐시 저장 실패가 정상 DB 응답을 막지 않아요.
  }
  return result;
}
