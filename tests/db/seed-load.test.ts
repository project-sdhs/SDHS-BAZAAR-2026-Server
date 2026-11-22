import path from 'node:path';

import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';

import { getPool } from '../../src/db/pool.js';
import { loadSeed } from '../../src/seed/load.js';
import { validateSeedDir, type SeedData } from '../../src/seed/validate.js';

const EXAMPLE_DIR = path.join(process.cwd(), 'seed-data', 'example');

async function exampleData(): Promise<SeedData> {
  const { data, errors } = await validateSeedDir(EXAMPLE_DIR);
  expect(errors).toEqual([]);
  return data!;
}

/** 트랜잭션 안에서 넣어 보고 끝나면 항상 ROLLBACK (테스트 DB에 남기지 않아요) */
async function inRollback(fn: (connection: PoolConnection) => Promise<void>): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await fn(connection);
  } finally {
    await connection.rollback();
    connection.release();
  }
}

async function rows<T extends RowDataPacket>(
  connection: PoolConnection,
  sql: string,
): Promise<T[]> {
  const [result] = await connection.query<T[]>(sql);
  return result;
}

describe('DB-05 · DB-06 시드 넣기', () => {
  it('example 을 넣으면 이름 · 코드가 id 로 연결되고 부스 메뉴 통계가 계산된다', async () => {
    const data = await exampleData();

    await inRollback(async (connection) => {
      // 테스트 DB에 시드가 남아 있어도 돌게 replace
      const summary = await loadSeed(connection, data, { replace: true });

      expect(summary).toEqual({
        buildings: 2,
        floors: 3,
        zones: 3,
        depositAccounts: 1,
        booths: 3,
        menus: 6,
        boothLocations: 3,
        settingsUpdated: true,
      });

      const [booth] = await rows<RowDataPacket>(
        connection,
        `SELECT b.name, b.type, b.hidden, c.grade, c.class_no, b.min_price, b.menu_count,
                TIME_FORMAT(b.open_time, '%H:%i') AS open_time, b.description
         FROM booths b JOIN classes c ON c.id = b.class_id
         WHERE b.booth_code = '230001'`,
      );
      // 판매 중 메뉴는 2,000 · 3,500 (3,000 세트는 품절)
      expect(booth).toMatchObject({
        name: '2-3 타코야끼',
        type: 'normal',
        hidden: 0,
        grade: 2,
        class_no: 3,
        min_price: 2000,
        menu_count: 2,
        open_time: '10:00',
        description: '겉바속촉 타코야끼, 4알 · 8알',
      });

      const [special] = await rows<RowDataPacket>(
        connection,
        "SELECT class_id, featured_order FROM booths WHERE booth_code = '900001'",
      );
      expect(special).toMatchObject({ class_id: null, featured_order: 1 });

      const [location] = await rows<RowDataPacket>(
        connection,
        `SELECT f.label, z.name AS zone, l.x, l.y
         FROM booth_locations l
         JOIN booths b ON b.id = l.booth_id
         JOIN floors f ON f.id = l.floor_id
         LEFT JOIN zones z ON z.id = l.zone_id
         WHERE b.booth_code = '230001'`,
      );
      expect(location).toEqual({ label: '본관 2층', zone: '복도', x: 0.42, y: 0.55 });
    });
  });

  it('설정은 INSERT 하지 않고 마이그레이션의 1행을 UPDATE 한다', async () => {
    const data = await exampleData();

    await inRollback(async (connection) => {
      await loadSeed(connection, data, { replace: true });

      const settings = await rows<RowDataPacket>(
        connection,
        `SELECT s.event_name, DATE_FORMAT(s.event_start_date, '%Y-%m-%d') AS start_date,
                s.charge_max, d.bank_name
         FROM bazaar_settings s LEFT JOIN deposit_accounts d ON d.id = s.deposit_account_id
         WHERE s.deleted_at IS NULL`,
      );
      expect(settings).toEqual([
        {
          event_name: '디지텍 바자회 (예시)',
          start_date: '2027-11-20',
          charge_max: null,
          bank_name: '테스트은행',
        },
      ]);
    });
  });

  it('이미 데이터가 있으면 멈추고, --replace 면 비우고 다시 넣는다', async () => {
    const data = await exampleData();

    await inRollback(async (connection) => {
      await loadSeed(connection, data, { replace: true });

      await expect(loadSeed(connection, data)).rejects.toThrow('이미 데이터가 있습니다.');

      await loadSeed(connection, data, { replace: true });
      const [count] = await rows<RowDataPacket>(connection, 'SELECT COUNT(*) AS n FROM booths');
      expect(Number(count.n)).toBe(3);
    });
  });

  it('없는 반을 가리키면 넣지 않는다', async () => {
    const data = await exampleData();
    data.booths[0] = { ...data.booths[0], grade: 3, classNo: 99 };

    await inRollback(async (connection) => {
      await expect(loadSeed(connection, data, { replace: true })).rejects.toThrow(
        '3학년 99반이 classes 에 없습니다.',
      );
    });
  });

  it('결제가 부스를 쓰고 있으면 교체하지 않는다', async () => {
    const data = await exampleData();

    await inRollback(async (connection) => {
      await loadSeed(connection, data, { replace: true });
      await connection.query(
        `INSERT INTO users (auth_provider, auth_subject) VALUES ('google', 'seed-load-test')`,
      );
      await connection.query(
        `INSERT INTO payments (user_id, booth_id, payment_no, total_amount, business_date,
                               idempotency_key, request_hash)
         SELECT LAST_INSERT_ID(), id, 1, 2000, '2027-11-20', REPEAT('k', 36), REPEAT('a', 64)
         FROM booths WHERE booth_code = '230001'`,
      );

      await expect(loadSeed(connection, data, { replace: true })).rejects.toThrow(
        '시드 교체는 행사 전(결제가 없을 때)에만 할 수 있어요.',
      );
    });
  });
});
