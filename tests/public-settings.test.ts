import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { PublicSettingsRow } from '../src/repositories/public-settings.repository.js';

const fakeRepository = vi.hoisted(() => ({ findPublicSettings: vi.fn() }));
vi.mock('../src/repositories/public-settings.repository.js', () => fakeRepository);

const app = createApp();

function settingsRow(
  overrides: Partial<Omit<PublicSettingsRow, 'constructor'>> = {},
): PublicSettingsRow {
  return {
    app_open: 1,
    event_name: '테스트 바자회',
    event_start_date: '2028-01-01',
    event_end_date: '2028-01-02',
    bank_name: '테스트은행',
    account_no: '000-1234-5678-90',
    holder_name: '테스트 학생회',
    depositor_name_rule: '{studentNo} {name}',
    depositor_name_rule_with_code: '{depositCode} {name}',
    charge_min: '2000',
    charge_max: '50000',
    balance_limit: '100000',
    ...overrides,
  } as PublicSettingsRow;
}

describe('공개 설정 API', () => {
  beforeEach(() => {
    fakeRepository.findPublicSettings.mockReset();
    fakeRepository.findPublicSettings.mockResolvedValue(settingsRow());
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

  it.each([
    [1, true],
    [0, false],
  ])('MySQL app_open=%i 를 boolean %s 로 반환하며 미공개 앱도 조회된다', async (raw, expected) => {
    fakeRepository.findPublicSettings.mockResolvedValue(settingsRow({ app_open: raw }));

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ appOpen: expected });
  });

  // LEFT JOIN의 실제 미등록 · 삭제 계좌 처리는 tests/db/에서도 검증해요.
  it('JOIN 결과에 계좌가 없으면 depositAccount 는 null 이다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsRow({ bank_name: null, account_no: null, holder_name: null }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ depositAccount: null });
  });

  it('최대 충전 한도와 잔액 한도가 NULL 이면 JSON null 을 유지한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsRow({ charge_max: null, balance_limit: null }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chargeMin: 2000, chargeMax: null, balanceLimit: null });
  });

  it('연말과 연초 날짜를 YYYY-MM-DD 그대로 반환한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsRow({ event_start_date: '2027-12-31', event_end_date: '2028-01-01' }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eventStartDate: '2027-12-31', eventEndDate: '2028-01-01' });
  });

  it('입금자명 규칙은 DB에서 읽고 안내용 예시는 명세의 고정 문자열을 쓴다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(
      settingsRow({
        depositor_name_rule: '{name} {studentNo}',
        depositor_name_rule_with_code: '{name} {depositCode}',
      }),
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      depositorNameRule: '{name} {studentNo}',
      depositorNameRuleWithCode: '{name} {depositCode}',
      depositorNameExample: '2205 이재원',
      depositorNameExampleWithCode: 'V3071 김하린',
    });
  });

  it('설정이 없으면 가짜 정상 응답 대신 공통 404 에러와 요청 ID를 반환한다', async () => {
    fakeRepository.findPublicSettings.mockResolvedValue(null);

    const res = await request(app).get('/settings/public').set('X-Request-Id', 'srv-20-missing');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('srv-20-missing');
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: '등록된 바자회 설정이 없습니다.',
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
      settingsRow({
        charge_min: '9007199254740991',
        charge_max: '9007199254740991',
        balance_limit: '9007199254740991',
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

  it.each(['charge_min', 'charge_max', 'balance_limit'] as const)(
    '%s 가 안전 정수 범위를 넘으면 반올림한 값 대신 500 을 반환한다',
    async (column) => {
      fakeRepository.findPublicSettings.mockResolvedValue(
        settingsRow({ [column]: '9007199254740993' }),
      );

      const res = await request(app).get('/settings/public');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        code: 'INTERNAL',
        message: '서버 오류예요. 잠시 후 다시 시도해 주세요.',
        requestId: res.headers['x-request-id'],
      });
    },
  );
});
