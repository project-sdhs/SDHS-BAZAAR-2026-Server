import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { PublicSettings, PublicSettingsData } from '../src/models/public-settings.model.js';
import {
  invalidatePublicSettingsCache,
  PUBLIC_SETTINGS_CACHE_KEY,
} from '../src/services/public-settings.service.js';

const fakeRepository = vi.hoisted(() => ({ findPublicSettings: vi.fn() }));
const fakeCache = vi.hoisted(() => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  deleteCache: vi.fn(),
}));
vi.mock('../src/repositories/public-settings.repository.js', () => fakeRepository);
vi.mock('../src/db/cache.js', () => fakeCache);

const app = createApp();

function settingsData(overrides: Partial<PublicSettingsData> = {}): PublicSettingsData {
  return {
    appOpen: true,
    eventName: '테스트 바자회',
    eventStartDate: '2028-01-01',
    eventEndDate: '2028-01-02',
    depositAccount: { bank: '테스트은행', accountNo: '000-1234-5678-90', holder: '테스트 학생회' },
    depositorNameRule: '{studentNo} {name}',
    depositorNameRuleWithCode: '{depositCode} {name}',
    chargeMin: 2000,
    chargeMax: 50000,
    balanceLimit: 100000,
    ...overrides,
  };
}

describe('공개 설정 API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fakeRepository.findPublicSettings.mockResolvedValue(settingsData());
    fakeCache.getCache.mockResolvedValue(null);
    fakeCache.setCache.mockResolvedValue(undefined);
    fakeCache.deleteCache.mockResolvedValue(true);
  });

  it('인증과 본문 없이 DB 설정을 공식 명세의 필드와 자료형으로 반환한다', async () => {
    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(res.body).toEqual({
      appOpen: true,
      eventName: '테스트 바자회',
      eventStartDate: '2028-01-01',
      eventEndDate: '2028-01-02',
      depositAccount: {
        bank: '테스트은행',
        accountNo: '000-1234-5678-90',
        holder: '테스트 학생회',
      },
      depositorNameRule: '{studentNo} {name}',
      depositorNameExample: '2205 이재원',
      depositorNameRuleWithCode: '{depositCode} {name}',
      depositorNameExampleWithCode: 'V3071 김하린',
      chargeMin: 2000,
      chargeMax: 50000,
      balanceLimit: 100000,
    });
    expect(fakeRepository.findPublicSettings).toHaveBeenCalledOnce();
  });

  it.each([true, false])('appOpen=%s 이어도 인증 없이 200으로 조회된다', async (expected) => {
    fakeRepository.findPublicSettings.mockResolvedValue(settingsData({ appOpen: expected }));

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ appOpen: expected });
  });

  // LEFT JOIN의 실제 미등록 · 삭제 계좌 처리는 tests/db/에서도 검증해요.
  it('JOIN 결과에 계좌가 없으면 depositAccount 는 null 이다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(settingsData({ depositAccount: null }));

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ depositAccount: null });
  });

  it('최대 충전 한도와 잔액 한도가 NULL 이면 JSON null 을 유지한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsData({ chargeMax: null, balanceLimit: null }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chargeMin: 2000, chargeMax: null, balanceLimit: null });
  });

  it('연말과 연초 날짜를 YYYY-MM-DD 그대로 반환한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsData({ eventStartDate: '2027-12-31', eventEndDate: '2028-01-01' }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eventStartDate: '2027-12-31', eventEndDate: '2028-01-01' });
  });

  it('입금자명 규칙의 순서가 바뀌면 예시도 같은 순서로 생성한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsData({
        depositorNameRule: '{name} {studentNo}',
        depositorNameRuleWithCode: '{name} {depositCode}',
      }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      depositorNameRule: '{name} {studentNo}',
      depositorNameRuleWithCode: '{name} {depositCode}',
      depositorNameExample: '이재원 2205',
      depositorNameExampleWithCode: '김하린 V3071',
    });
  });

  it('설정이 없으면 배포/데이터 오류이므로 공통 500 에러와 요청 ID를 반환한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(null);

    const res = await request(app).get('/settings/public').set('X-Request-Id', 'srv-20-missing');

    expect(res.status).toBe(500);
    expect(res.headers['x-request-id']).toBe('srv-20-missing');
    expect(res.body).toEqual({
      code: 'INTERNAL',
      message: '서버 오류예요. 잠시 후 다시 시도해 주세요.',
      requestId: 'srv-20-missing',
    });
  });

  it('DB 오류는 공통 500 에러로 처리하고 SQL 및 내부 정보를 노출하지 않는다', async () => {
    fakeRepository.findPublicSettings.mockRejectedValue(
      new Error('ER_BAD_FIELD_ERROR: SELECT private_column FROM bazaar_settings'),
    );

    const res = await request(app).get('/settings/public').set('X-Request-Id', 'srv-20-db-error');

    expect(res.status).toBe(500);
    expect(res.headers['x-request-id']).toBe('srv-20-db-error');
    expect(res.body).toEqual({
      code: 'INTERNAL',
      message: '서버 오류예요. 잠시 후 다시 시도해 주세요.',
      requestId: 'srv-20-db-error',
    });
  });

  it('안전 정수 최댓값까지 금액을 정확한 JSON number 로 반환한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsData({
        chargeMin: Number.MAX_SAFE_INTEGER,
        chargeMax: Number.MAX_SAFE_INTEGER,
        balanceLimit: Number.MAX_SAFE_INTEGER,
      }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      chargeMin: Number.MAX_SAFE_INTEGER,
      chargeMax: Number.MAX_SAFE_INTEGER,
      balanceLimit: Number.MAX_SAFE_INTEGER,
    });
  });

  it('반복된 자리표시자를 모두 치환하고 구분 문자는 유지한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsData({
        depositorNameRule: '{name}/{studentNo}/{name}',
        depositorNameRuleWithCode: '[{depositCode}]-{name}-{depositCode}',
      }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      depositorNameExample: '이재원/2205/이재원',
      depositorNameExampleWithCode: '[V3071]-김하린-V3071',
    });
  });

  it('캐시 miss 시 DB에서 조회한 응답을 10초 동안 저장한다', async () => {
    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(fakeCache.getCache).toHaveBeenCalledWith(PUBLIC_SETTINGS_CACHE_KEY);
    expect(fakeRepository.findPublicSettings).toHaveBeenCalledOnce();
    expect(fakeCache.setCache).toHaveBeenCalledWith(PUBLIC_SETTINGS_CACHE_KEY, res.body, 10);
  });

  it('캐시 hit 시 DB를 읽거나 캐시 TTL을 다시 늘리지 않는다', async () => {
    const cached: PublicSettings = {
      ...settingsData({ appOpen: false, eventName: '캐시된 행사' }),
      depositorNameExample: '2205 이재원',
      depositorNameExampleWithCode: 'V3071 김하린',
    };
    fakeCache.getCache.mockResolvedValue(cached);

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
    expect(fakeRepository.findPublicSettings).not.toHaveBeenCalled();
    expect(fakeCache.setCache).not.toHaveBeenCalled();
  });

  it('Redis 조회가 실패해도 DB 설정을 HTTP 200으로 반환한다', async () => {
    fakeCache.getCache.mockRejectedValue(new Error('Redis unavailable'));

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eventName: '테스트 바자회' });
    expect(fakeRepository.findPublicSettings).toHaveBeenCalledOnce();
  });

  it('Redis 저장이 실패해도 DB 설정을 HTTP 200으로 반환한다', async () => {
    fakeCache.setCache.mockRejectedValue(new Error('Redis unavailable'));

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eventName: '테스트 바자회' });
  });

  it('DB 오류와 설정 누락 응답은 캐시에 저장하지 않는다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValueOnce(null);
    expect((await request(app).get('/settings/public')).status).toBe(500);
    fakeRepository.findPublicSettings.mockRejectedValueOnce(new Error('DB unavailable'));
    expect((await request(app).get('/settings/public')).status).toBe(500);
    expect(fakeCache.setCache).not.toHaveBeenCalled();
  });

  it('설정 저장 티켓에서 공개 캐시를 무효화할 수 있다', async () => {
    await invalidatePublicSettingsCache();

    expect(fakeCache.deleteCache).toHaveBeenCalledExactlyOnceWith(PUBLIC_SETTINGS_CACHE_KEY);
  });
});
