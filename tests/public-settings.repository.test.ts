import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findPublicSettings } from '../src/repositories/public-settings.repository.js';

const fakePool = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ getPool: () => fakePool }));

const row = {
  app_open: 1,
  event_name: '저장소 테스트 행사',
  event_start_date: '2027-12-31',
  event_end_date: '2028-01-01',
  bank_name: '테스트은행',
  account_no: '000-0000-0000',
  holder_name: '테스트 학생회',
  depositor_name_rule: '{studentNo} {name}',
  depositor_name_rule_with_code: '{depositCode} {name}',
  charge_min: '2000',
  charge_max: '50000',
  balance_limit: '100000',
};

describe('공개 설정 저장소 변환', () => {
  beforeEach(() => {
    fakePool.execute.mockReset();
    fakePool.execute.mockResolvedValue([[{ ...row }], []]);
  });

  it('DB 내부 필드를 포함하지 않고 camelCase 및 응답 자료형으로 반환한다', async () => {
    fakePool.execute.mockResolvedValue([[{ ...row, updated_by_admin_id: 99 }], []]);

    expect(await findPublicSettings()).toEqual({
      appOpen: true,
      eventName: '저장소 테스트 행사',
      eventStartDate: '2027-12-31',
      eventEndDate: '2028-01-01',
      depositAccount: { bank: '테스트은행', accountNo: '000-0000-0000', holder: '테스트 학생회' },
      depositorNameRule: '{studentNo} {name}',
      depositorNameRuleWithCode: '{depositCode} {name}',
      chargeMin: 2000,
      chargeMax: 50000,
      balanceLimit: 100000,
    });
  });

  it.each([
    [1, true],
    [0, false],
  ])('MySQL BOOLEAN %i를 %s로 바꾼다', async (value, expected) => {
    fakePool.execute.mockResolvedValue([[{ ...row, app_open: value }], []]);

    expect(await findPublicSettings()).toMatchObject({ appOpen: expected });
  });

  it('계좌와 한도의 NULL을 그대로 유지한다', async () => {
    fakePool.execute.mockResolvedValue([
      [
        {
          ...row,
          bank_name: null,
          account_no: null,
          holder_name: null,
          charge_max: null,
          balance_limit: null,
        },
      ],
      [],
    ]);

    expect(await findPublicSettings()).toMatchObject({
      depositAccount: null,
      chargeMax: null,
      balanceLimit: null,
    });
  });

  it('안전 정수 최댓값을 정확한 number로 반환한다', async () => {
    fakePool.execute.mockResolvedValue([
      [
        {
          ...row,
          charge_min: '9007199254740991',
          charge_max: '9007199254740991',
          balance_limit: '9007199254740991',
        },
      ],
      [],
    ]);

    expect(await findPublicSettings()).toMatchObject({
      chargeMin: Number.MAX_SAFE_INTEGER,
      chargeMax: Number.MAX_SAFE_INTEGER,
      balanceLimit: Number.MAX_SAFE_INTEGER,
    });
  });

  it.each(['charge_min', 'charge_max', 'balance_limit'] as const)(
    '%s가 안전 정수를 넘으면 반올림한 응답을 만들지 않는다',
    async (column) => {
      fakePool.execute.mockResolvedValue([[{ ...row, [column]: '9007199254740993' }], []]);

      await expect(findPublicSettings()).rejects.toThrow('안전 정수 범위');
    },
  );

  it('설정 행이 없으면 null을 반환한다', async () => {
    fakePool.execute.mockResolvedValue([[], []]);

    expect(await findPublicSettings()).toBeNull();
  });
});
