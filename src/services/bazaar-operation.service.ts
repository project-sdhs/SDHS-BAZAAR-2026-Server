/**
 * SRV-13: 바자회 운영 상태 판단
 *
 * 한국 시간(Asia/Seoul)을 기준으로 검사한다.
 * DB 조회나 HTTP 오류 처리와는 분리된 순수 함수다.
 */

export interface BazaarStatusSettings {
  appOpen: boolean;
  eventEndDate: string;
}

export type OperationStatus = 'APP_CLOSED' | 'EVENT_ENDED' | 'AVAILABLE';

export interface OperationResult {
  allowed: boolean;
  status: OperationStatus;
}

const SEOUL_TIME_ZONE = 'Asia/Seoul';

/**
 * Date 객체를 한국 날짜 YYYY-MM-DD로 변환한다.
 */
export function getSeoulDate(now: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * 앱 공개 여부 확인
 *
 * 비공개 상태면 APP_CLOSED를 반환한다.
 * HTTP 미들웨어에서 503 APP_NOT_OPEN으로 변환한다.
 */
export function checkAppVisibility(
  settings: Pick<BazaarStatusSettings, 'appOpen'>,
): OperationResult {
  if (!settings.appOpen) {
    return {
      allowed: false,
      status: 'APP_CLOSED',
    };
  }

  return {
    allowed: true,
    status: 'AVAILABLE',
  };
}

/**
 * 행사 종료 후 충전 제한
 *
 * 행사 시작 전: 충전 허용
 * 행사 진행 중: 충전 허용
 * 행사 종료일 당일: 충전 허용
 * 종료일 다음 날 00:00 KST부터: 충전 차단
 *
 * HTTP 미들웨어에서 409 EVENT_ENDED로 변환한다.
 */
export function checkEventPeriod(
  settings: Pick<BazaarStatusSettings, 'eventEndDate'>,
  now: Date = new Date(),
): OperationResult {
  const today = getSeoulDate(now);

  if (today > settings.eventEndDate) {
    return {
      allowed: false,
      status: 'EVENT_ENDED',
    };
  }

  return {
    allowed: true,
    status: 'AVAILABLE',
  };
}
