import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

import type { SeedData } from './validate.js';

/**
 * 검사한 시드 데이터를 DB에 넣어요. (DB-05 부스 · 메뉴, DB-06 지도, DB-17 실데이터 교체)
 * 넘겨받은 연결의 트랜잭션 안에서 실행해요. 하나라도 실패하면 호출한 쪽이 ROLLBACK 해요.
 *
 * - 순서: 건물 → 층 → 구역 → 입금 계좌 → 부스 → 메뉴 → 부스 메뉴 통계 → 부스 위치 → 설정
 *   CSV의 이름 · 코드(건물 이름, 층 번호, 부스 코드, 반의 학년 · 반, account_key)를 DB id 로 바꿔서 넣어요.
 * - booths.min_price · menu_count 는 넣은 메뉴(판매 중)로 계산해요. (서버 규칙 25)
 * - bazaar_settings 는 INSERT 하지 않아요. 마이그레이션 시드(037)가 만든 1행을 UPDATE 해요. (서버 규칙 44)
 * - 부스 · 메뉴 · 지도 · 입금 계좌 표에 이미 행이 있으면 멈춰요. replace 면 그 표들을 비우고 다시 넣어요.
 *   결제 · 캐셔 · QR 등이 부스를 쓰고 있으면 FK 때문에 지울 수 없어서 실패해요. (행사 전에만 교체)
 */

export interface SeedSummary {
  buildings: number;
  floors: number;
  zones: number;
  depositAccounts: number;
  booths: number;
  menus: number;
  boothLocations: number;
  settingsUpdated: boolean;
}

/** 이 순서대로 지워요. (FK 가 가리키는 쪽을 나중에) */
const SEED_TABLES = [
  'booth_locations',
  'zones',
  'floors',
  'buildings',
  'menus',
  'booths',
  'deposit_accounts',
] as const;

interface CountRow extends RowDataPacket {
  count: number;
}

interface ClassRow extends RowDataPacket {
  id: number;
  grade: number;
  class_no: number;
}

interface IdRow extends RowDataPacket {
  id: number;
}

async function insertRow(
  connection: PoolConnection,
  table: string,
  row: Record<string, unknown>,
): Promise<number> {
  const columns = Object.keys(row);
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    Object.values(row) as (string | number | boolean | null)[],
  );
  return result.insertId;
}

function isForeignKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1451;
}

async function clearSeedTables(connection: PoolConnection): Promise<void> {
  // 설정이 가리키는 입금 계좌부터 끊어요.
  await connection.query('UPDATE bazaar_settings SET deposit_account_id = NULL');

  for (const table of SEED_TABLES) {
    try {
      await connection.query(`DELETE FROM ${table}`);
    } catch (error) {
      if (isForeignKeyError(error)) {
        throw new Error(
          `${table} 를 지울 수 없습니다. 결제 · 캐셔 · QR · 충전 요청 같은 다른 데이터가 쓰고 있어요. ` +
            '시드 교체는 행사 전(결제가 없을 때)에만 할 수 있어요.',
          { cause: error },
        );
      }
      throw error;
    }
  }
}

export async function loadSeed(
  connection: PoolConnection,
  data: SeedData,
  options: { replace?: boolean } = {},
): Promise<SeedSummary> {
  // 1. 이미 데이터가 있는지
  const existing: string[] = [];
  for (const table of SEED_TABLES) {
    const [rows] = await connection.query<CountRow[]>(`SELECT COUNT(*) AS count FROM ${table}`);
    if (Number(rows[0].count) > 0) {
      existing.push(`${table} ${rows[0].count}행`);
    }
  }

  if (existing.length > 0) {
    if (!options.replace) {
      throw new Error(
        `이미 데이터가 있습니다. (${existing.join(', ')}) 지우고 다시 넣으려면 --replace 를 붙여 주세요.`,
      );
    }
    await clearSeedTables(connection);
  }

  // 2. 지도: 건물 → 층 → 구역
  const buildingIds = new Map<string, number>();
  for (const building of data.buildings) {
    buildingIds.set(
      building.name,
      await insertRow(connection, 'buildings', {
        name: building.name,
        sort_order: building.sortOrder,
      }),
    );
  }

  const floorIds = new Map<string, number>();
  for (const floor of data.floors) {
    floorIds.set(
      `${floor.buildingName}|${floor.level}`,
      await insertRow(connection, 'floors', {
        building_id: buildingIds.get(floor.buildingName),
        level: floor.level,
        label: floor.label,
        map_image_url: floor.mapImageUrl,
        width_m: floor.widthM,
        height_m: floor.heightM,
      }),
    );
  }

  const zoneIds = new Map<string, number>();
  for (const zone of data.zones) {
    zoneIds.set(
      `${zone.buildingName}|${zone.floorLevel}|${zone.name}`,
      await insertRow(connection, 'zones', {
        floor_id: floorIds.get(`${zone.buildingName}|${zone.floorLevel}`),
        name: zone.name,
      }),
    );
  }

  // 3. 입금 계좌
  const accountIds = new Map<string, number>();
  for (const account of data.depositAccounts) {
    accountIds.set(
      account.accountKey,
      await insertRow(connection, 'deposit_accounts', {
        bank_name: account.bankName,
        account_no: account.accountNo,
        holder_name: account.holderName,
      }),
    );
  }

  // 4. 부스: 학년 · 반 → classes.id
  const [classRows] = await connection.query<ClassRow[]>(
    'SELECT id, grade, class_no FROM classes WHERE deleted_at IS NULL',
  );
  const classIds = new Map(classRows.map((row) => [`${row.grade}-${row.class_no}`, row.id]));

  const boothIds = new Map<string, number>();
  for (const booth of data.booths) {
    let classId: number | null = null;
    if (booth.type === 'normal') {
      classId = classIds.get(`${booth.grade}-${booth.classNo}`) ?? null;
      if (classId === null) {
        throw new Error(
          `부스 ${booth.boothCode} '${booth.name}': ${booth.grade}학년 ${booth.classNo}반이 classes 에 없습니다.`,
        );
      }
    }

    boothIds.set(
      booth.boothCode,
      await insertRow(connection, 'booths', {
        class_id: classId,
        name: booth.name,
        category: booth.category,
        type: booth.type,
        hidden: booth.hidden,
        featured_order: booth.featuredOrder,
        open_time: booth.openTime,
        close_time: booth.closeTime,
        description: booth.description,
        image_url: booth.imageUrl,
        booth_code: booth.boothCode,
      }),
    );
  }

  // 5. 메뉴
  for (const menu of data.menus) {
    await insertRow(connection, 'menus', {
      booth_id: boothIds.get(menu.boothCode),
      name: menu.name,
      description: menu.description,
      price: menu.price,
      on_sale: menu.onSale,
      sort_order: menu.sortOrder,
      image_url: menu.imageUrl,
    });
  }

  // 6. 부스 메뉴 통계: 판매 중 메뉴 최저가 · 수 (서버 규칙 25)
  if (boothIds.size > 0) {
    await connection.query(
      `UPDATE booths b
       SET min_price = (
             SELECT MIN(m.price) FROM menus m
             WHERE m.booth_id = b.id AND m.on_sale = TRUE AND m.deleted_at IS NULL
           ),
           menu_count = (
             SELECT COUNT(*) FROM menus m
             WHERE m.booth_id = b.id AND m.on_sale = TRUE AND m.deleted_at IS NULL
           )
       WHERE b.id IN (?)`,
      [[...boothIds.values()]],
    );
  }

  // 7. 부스 위치
  for (const location of data.boothLocations) {
    await insertRow(connection, 'booth_locations', {
      booth_id: boothIds.get(location.boothCode),
      floor_id: floorIds.get(`${location.buildingName}|${location.floorLevel}`),
      zone_id:
        location.zoneName === null
          ? null
          : zoneIds.get(`${location.buildingName}|${location.floorLevel}|${location.zoneName}`),
      x: location.x,
      y: location.y,
    });
  }

  // 8. 설정: 마이그레이션이 만든 1행을 UPDATE (INSERT 하지 않아요)
  let settingsUpdated = false;
  if (data.settings) {
    const [settingsRows] = await connection.query<IdRow[]>(
      'SELECT id FROM bazaar_settings WHERE deleted_at IS NULL FOR UPDATE',
    );
    if (settingsRows.length !== 1) {
      throw new Error(
        `bazaar_settings 행이 ${settingsRows.length}개입니다. 마이그레이션(037)이 만든 1행이 있어야 해요.`,
      );
    }

    const settings = data.settings;
    await connection.execute(
      `UPDATE bazaar_settings
       SET event_name = ?, event_start_date = ?, event_end_date = ?,
           default_open_time = ?, default_close_time = ?, app_open = ?,
           charge_min = ?, charge_max = ?, balance_limit = ?, refund_window_hours = ?,
           daily_payment_no_reset = ?, block_old_qr = ?, deposit_account_id = ?
       WHERE id = ?`,
      [
        settings.eventName,
        settings.eventStartDate,
        settings.eventEndDate,
        settings.defaultOpenTime,
        settings.defaultCloseTime,
        settings.appOpen,
        settings.chargeMin,
        settings.chargeMax,
        settings.balanceLimit,
        settings.refundWindowHours,
        settings.dailyPaymentNoReset,
        settings.blockOldQr,
        settings.depositAccountKey === null
          ? null
          : (accountIds.get(settings.depositAccountKey) ?? null),
        settingsRows[0].id,
      ],
    );
    settingsUpdated = true;
  }

  return {
    buildings: data.buildings.length,
    floors: data.floors.length,
    zones: data.zones.length,
    depositAccounts: data.depositAccounts.length,
    booths: data.booths.length,
    menus: data.menus.length,
    boothLocations: data.boothLocations.length,
    settingsUpdated,
  };
}
