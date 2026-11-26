import type { ResultSetHeader } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { createApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { getCache } from '../../src/db/cache.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../../src/db/redis.js';
import { findPublicSettings } from '../../src/repositories/public-settings.repository.js';
import {
  invalidatePublicSettingsCache,
  PUBLIC_SETTINGS_CACHE_KEY,
} from '../../src/services/public-settings.service.js';

const app = createApp();

describe('public-settings.repository (실제 DB · HTTP)', () => {
  let connection: PoolConnection;
  let settingsId: number;
  let accountId: number;
  let executeSpy: MockInstance<Pool['execute']>;

  beforeAll(async () => {
    await connectRedis();
  });

  beforeEach(async () => {
    await invalidatePublicSettingsCache();
    const pool = getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 저장소의 실제 SQL을 같은 트랜잭션에서 실행하고, 테스트 후 시드까지 원래대로 복원해요.
    executeSpy = vi.spyOn(pool, 'execute').mockImplementation(connection.execute.bind(connection));
    await connection.execute('UPDATE bazaar_settings SET deleted_at = CURRENT_TIMESTAMP(3)');
    const [account] = await connection.execute<ResultSetHeader>(
      'INSERT INTO deposit_accounts (bank_name, account_no, holder_name) VALUES (?, ?, ?)',
      ['통합테스트은행', '000-0000-0000', '통합테스트 학생회'],
    );
    accountId = account.insertId;
    const [settings] = await connection.execute<ResultSetHeader>(
      `INSERT INTO bazaar_settings
       (event_name, event_start_date, event_end_date, app_open, deposit_account_id,
        depositor_name_rule, depositor_name_rule_with_code, charge_min, charge_max, balance_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'DB 테스트 행사',
        '2027-12-31',
        '2028-01-01',
        1,
        accountId,
        '{name} {studentNo}',
        '{name} {depositCode}',
        '3000',
        '70000',
        '150000',
      ],
    );
    settingsId = settings.insertId;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await invalidatePublicSettingsCache();
    } finally {
      if (connection) {
        try {
          await connection.rollback();
        } finally {
          connection.release();
        }
      }
    }
  });

  afterAll(async () => {
    await disconnectRedis();
    await closePool();
  });

  it('실제 컬럼과 계좌 JOIN 결과를 공개 필드로만 반환한다', async () => {
    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      appOpen: true,
      eventName: 'DB 테스트 행사',
      eventStartDate: '2027-12-31',
      eventEndDate: '2028-01-01',
      depositAccount: {
        bank: '통합테스트은행',
        accountNo: '000-0000-0000',
        holder: '통합테스트 학생회',
      },
      depositorNameRule: '{name} {studentNo}',
      depositorNameExample: '이재원 2205',
      depositorNameRuleWithCode: '{name} {depositCode}',
      depositorNameExampleWithCode: '김하린 V3071',
      chargeMin: 3000,
      chargeMax: 70000,
      balanceLimit: 150000,
    });
  });

  it('새로운 삭제 행이 있어도 살아 있는 설정만 하나 읽는다', async () => {
    await connection.execute(
      `INSERT INTO bazaar_settings (event_name, event_start_date, event_end_date, deleted_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))`,
      ['삭제된 설정', '2030-01-01', '2030-01-02'],
    );

    expect(await findPublicSettings()).toMatchObject({ eventName: 'DB 테스트 행사' });
  });

  it('app_open=0 이어도 인증 없이 200 과 false 를 반환한다', async () => {
    await connection.execute('UPDATE bazaar_settings SET app_open = 0 WHERE id = ?', [settingsId]);

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ appOpen: false });
  });

  it('deposit_account_id=NULL 이면 설정을 유지하고 계좌만 null 로 반환한다', async () => {
    await connection.execute('UPDATE bazaar_settings SET deposit_account_id = NULL WHERE id = ?', [
      settingsId,
    ]);

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eventName: 'DB 테스트 행사', depositAccount: null });
  });

  it('참조 계좌가 삭제되면 설정을 유지하고 계좌만 null 로 반환한다', async () => {
    await connection.execute(
      'UPDATE deposit_accounts SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [accountId],
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eventName: 'DB 테스트 행사', depositAccount: null });
  });

  it('DATE 는 문자열, BIGINT 는 number, nullable 한도는 null 로 반환한다', async () => {
    await connection.execute(
      'UPDATE bazaar_settings SET charge_max = NULL, balance_limit = NULL WHERE id = ?',
      [settingsId],
    );

    expect(await findPublicSettings()).toMatchObject({
      eventStartDate: '2027-12-31',
      eventEndDate: '2028-01-01',
      chargeMin: 3000,
      chargeMax: null,
      balanceLimit: null,
    });
    const res = await request(app).get('/settings/public');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chargeMin: 3000, chargeMax: null, balanceLimit: null });
  });

  it('살아 있는 설정이 없으면 저장소는 null, HTTP 응답은 공통 500 이다', async () => {
    await connection.execute('UPDATE bazaar_settings SET deleted_at = CURRENT_TIMESTAMP(3)');

    expect(await findPublicSettings()).toBeNull();
    const res = await request(app).get('/settings/public');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL', requestId: res.headers['x-request-id'] });
    expect(await getCache(PUBLIC_SETTINGS_CACHE_KEY)).toBeNull();
  });

  it('안전 정수 최댓값을 MySQL에서 읽어 정확한 number 로 반환한다', async () => {
    await connection.execute(
      'UPDATE bazaar_settings SET charge_max = ?, balance_limit = ? WHERE id = ?',
      ['9007199254740991', '9007199254740991', settingsId],
    );

    const res = await request(app).get('/settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      chargeMax: Number.MAX_SAFE_INTEGER,
      balanceLimit: Number.MAX_SAFE_INTEGER,
    });
  });

  it('BIGINT 를 드라이버에서 반올림하지 않으며 안전 정수 초과는 공통 500 이다', async () => {
    await connection.execute('UPDATE bazaar_settings SET charge_max = ? WHERE id = ?', [
      '9223372036854775807',
      settingsId,
    ]);

    await expect(findPublicSettings()).rejects.toThrow('안전 정수 범위');
    const res = await request(app).get('/settings/public');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      code: 'INTERNAL',
      message: '서버 오류예요. 잠시 후 다시 시도해 주세요.',
      requestId: res.headers['x-request-id'],
    });
  });

  it('Redis hit 는 DB 를 다시 읽지 않고 무효화 후에는 새 DB 값과 예시를 읽는다', async () => {
    const first = await request(app).get('/settings/public');
    expect(first.status).toBe(200);
    expect(executeSpy).toHaveBeenCalledTimes(1);

    await connection.execute(
      'UPDATE bazaar_settings SET event_name = ?, depositor_name_rule = ? WHERE id = ?',
      ['변경된 행사', '{studentNo}-{name}', settingsId],
    );

    const cached = await request(app).get('/settings/public');
    expect(cached.status).toBe(200);
    expect(cached.body).toEqual(first.body);
    expect(executeSpy).toHaveBeenCalledTimes(1);

    await invalidatePublicSettingsCache();
    expect(await getCache(PUBLIC_SETTINGS_CACHE_KEY)).toBeNull();
    const refreshed = await request(app).get('/settings/public');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      eventName: '변경된 행사',
      depositorNameExample: '2205-이재원',
    });
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it('실제 Redis 에 공개 응답을 저장하고 TTL 을 10초로 제한한다', async () => {
    const response = await request(app).get('/settings/public');

    expect(response.status).toBe(200);
    expect(await getCache(PUBLIC_SETTINGS_CACHE_KEY)).toEqual(response.body);
    const ttl = await getRedisClient().ttl(`bazaar:cache:${PUBLIC_SETTINGS_CACHE_KEY}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  it('Redis 연결이 없어도 실제 DB 설정을 HTTP 200 으로 반환한다', async () => {
    await disconnectRedis();
    try {
      const response = await request(app).get('/settings/public');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        eventName: 'DB 테스트 행사',
        depositorNameExample: '이재원 2205',
      });
    } finally {
      await connectRedis();
    }
  });
});
