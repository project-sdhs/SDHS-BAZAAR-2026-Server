import type { BazaarOperationSettings } from '../repositories/bazaar-settings.repository.js';

/**
 * SRV-13: 바자회 운영 상태 판단
 *
 * 서버 실행 환경의 시간대와 관계없이
 * 한국 시간(Asia/Seoul)을 기준으로 판단한다.
 */

export type OperationStatus =
  'APP_CLOSED' | 'EVENT_NOT_STARTED' | 'EVENT_ENDED' | 'BEFORE_OPEN' | 'AFTER_CLOSE' | 'AVAILABLE';

export interface OperationResult {
  allowed: boolean;
  status: OperationStatus;
}

interface LocalDateTime {
  date: string;
  time: string;
}

const SEOUL_TIME_ZONE = 'Asia/Seoul';

function getSeoulDateTime(now: Date): LocalDateTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(now);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

/**
 * 행사 기간을 확인한다.
 *
 * 시작일은 포함하고 종료일도 포함한다.
 * 종료일 다음 날부터 EVENT_ENDED로 판단한다.
 */
export function checkEventPeriod(
  settings: BazaarOperationSettings,
  now: Date = new Date(),
): OperationResult {
  const { date } = getSeoulDateTime(now);

  if (date < settings.eventStartDate) {
    return {
      allowed: false,
      status: 'EVENT_NOT_STARTED',
    };
  }

  if (date > settings.eventEndDate) {
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

/**
 * 행사 기본 운영 시간을 확인한다.
 *
 * 시작 시각은 포함하고 종료 시각은 제외한다.
 * 날짜와 시간은 모두 한국 시간 기준이다.
 */
export function checkOperationHours(
  settings: BazaarOperationSettings,
  now: Date = new Date(),
): OperationResult {
  const { time } = getSeoulDateTime(now);

  if (time < settings.defaultOpenTime) {
    return {
      allowed: false,
      status: 'BEFORE_OPEN',
    };
  }

  if (time >= settings.defaultCloseTime) {
    return {
      allowed: false,
      status: 'AFTER_CLOSE',
    };
  }

  return {
    allowed: true,
    status: 'AVAILABLE',
  };
}

/** 앱 공개 상태를 확인한다. */
export function checkAppVisibility(settings: BazaarOperationSettings): OperationResult {
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
 * 행사 기간과 기본 운영 시간을 종합 확인한다.
 *
 * 주의: 이 함수는 운영 상태를 판단하는 공통 함수다.
 * 충전·결제별로 어떤 조건을 적용할지는
 * SRV-13의 API 명세에 맞춰 별도로 결정한다.
 */
export function checkBazaarOperation(
  settings: BazaarOperationSettings,
  now: Date = new Date(),
): OperationResult {
  const period = checkEventPeriod(settings, now);

  if (!period.allowed) {
    return period;
  }

  const hours = checkOperationHours(settings, now);

  if (!hours.allowed) {
    return hours;
  }

  return {
    allowed: true,
    status: 'AVAILABLE',
  };
}
