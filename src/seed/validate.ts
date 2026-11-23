import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseCsv, type CsvRecord } from './csv.js';

/**
 * 시드 CSV 검사 (DB-05 · DB-06 · DB-17)
 * 폴더 하나에 아래 8개 파일을 두고, 각 파일의 첫 줄은 정해진 헤더예요. (열 순서는 상관없어요)
 * 형식은 seed-data/README.md 에 정리했어요.
 */
export const SEED_FILES = {
  buildings: ['name', 'sort_order'],
  floors: ['building_name', 'level', 'label', 'map_image_url', 'width_m', 'height_m'],
  zones: ['building_name', 'floor_level', 'name'],
  booths: [
    'booth_code',
    'name',
    'category',
    'type',
    'grade',
    'class_no',
    'hidden',
    'featured_order',
    'open_time',
    'close_time',
    'description',
    'image_url',
  ],
  menus: ['booth_code', 'name', 'description', 'price', 'on_sale', 'sort_order', 'image_url'],
  booth_locations: ['booth_code', 'building_name', 'floor_level', 'zone_name', 'x', 'y'],
  deposit_accounts: ['account_key', 'bank_name', 'account_no', 'holder_name'],
  bazaar_settings: [
    'event_name',
    'event_start_date',
    'event_end_date',
    'default_open_time',
    'default_close_time',
    'app_open',
    'charge_min',
    'charge_max',
    'balance_limit',
    'refund_window_hours',
    'daily_payment_no_reset',
    'block_old_qr',
    'deposit_account_key',
  ],
} as const;

export type SeedFile = keyof typeof SEED_FILES;

export interface SeedBuilding {
  name: string;
  sortOrder: number;
}

export interface SeedFloor {
  buildingName: string;
  level: number;
  label: string;
  mapImageUrl: string;
  widthM: number;
  heightM: number;
}

export interface SeedZone {
  buildingName: string;
  floorLevel: number;
  name: string;
}

export interface SeedBooth {
  boothCode: string;
  name: string;
  category: string;
  type: 'normal' | 'special';
  grade: number | null;
  classNo: number | null;
  hidden: boolean;
  featuredOrder: number | null;
  openTime: string;
  closeTime: string;
  description: string;
  imageUrl: string | null;
}

export interface SeedMenu {
  boothCode: string;
  name: string;
  description: string | null;
  price: number;
  onSale: boolean;
  sortOrder: number;
  imageUrl: string | null;
}

export interface SeedBoothLocation {
  boothCode: string;
  buildingName: string;
  floorLevel: number;
  zoneName: string | null;
  x: number;
  y: number;
}

export interface SeedDepositAccount {
  accountKey: string;
  bankName: string;
  accountNo: string;
  holderName: string;
}

export interface SeedSettings {
  eventName: string;
  eventStartDate: string;
  eventEndDate: string;
  defaultOpenTime: string;
  defaultCloseTime: string;
  appOpen: boolean;
  chargeMin: number;
  chargeMax: number | null;
  balanceLimit: number | null;
  refundWindowHours: number;
  dailyPaymentNoReset: boolean;
  blockOldQr: boolean;
  depositAccountKey: string | null;
}

export interface SeedData {
  buildings: SeedBuilding[];
  floors: SeedFloor[];
  zones: SeedZone[];
  booths: SeedBooth[];
  menus: SeedMenu[];
  boothLocations: SeedBoothLocation[];
  depositAccounts: SeedDepositAccount[];
  /** 0행이면 null: 설정 행을 건드리지 않아요. */
  settings: SeedSettings | null;
}

export interface SeedResult {
  data: SeedData | null;
  errors: string[];
}

/** 한 행을 읽으면서 열 값을 타입에 맞게 바꾸고, 틀리면 에러를 모아요. */
class RowReader {
  constructor(
    private readonly file: string,
    private readonly record: CsvRecord,
    private readonly columns: Map<string, number>,
    private readonly errors: string[],
  ) {}

  private fail(column: string, message: string): void {
    this.errors.push(`${this.file}.csv:${this.record.line} ${column}: ${message}`);
  }

  private raw(column: string): string {
    return this.record.values[this.columns.get(column) ?? -1] ?? '';
  }

  text(column: string, maxLength: number): string {
    const value = this.raw(column);
    if (value === '') {
      this.fail(column, '값이 비어 있습니다.');
    } else if (value.length > maxLength) {
      this.fail(column, `${maxLength}자 이하로 적어 주세요. (지금 ${value.length}자)`);
    }
    return value;
  }

  optionalText(column: string, maxLength: number): string | null {
    const value = this.raw(column);
    if (value === '') return null;
    if (value.length > maxLength) {
      this.fail(column, `${maxLength}자 이하로 적어 주세요. (지금 ${value.length}자)`);
    }
    return value;
  }

  int(column: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
    const value = this.raw(column);
    const parsed = /^-?\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      const range = max === Number.MAX_SAFE_INTEGER ? `${min} 이상` : `${min}~${max}`;
      this.fail(column, `${range} 정수여야 합니다. (지금 '${value}')`);
      return min;
    }
    return parsed;
  }

  optionalInt(column: string, min: number, max?: number): number | null {
    return this.raw(column) === '' ? null : this.int(column, min, max);
  }

  decimal(column: string, min: number, max: number, minExclusive = false): number {
    const value = this.raw(column);
    const parsed = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
    const tooSmall = minExclusive ? parsed <= min : parsed < min;
    if (Number.isNaN(parsed) || tooSmall || parsed > max) {
      this.fail(
        column,
        `${minExclusive ? `${min} 초과` : `${min} 이상`} ${max} 이하 숫자여야 합니다. (지금 '${value}')`,
      );
      return min;
    }
    return parsed;
  }

  bool(column: string): boolean {
    const value = this.raw(column).toLowerCase();
    if (value !== 'true' && value !== 'false') {
      this.fail(column, `true 또는 false 로 적어 주세요. (지금 '${this.raw(column)}')`);
    }
    return value === 'true';
  }

  /** HH:mm 또는 HH:mm:ss → HH:mm:ss */
  time(column: string): string {
    const value = this.raw(column);
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
    if (!match) {
      this.fail(column, `시각은 HH:mm 로 적어 주세요. (예: 10:00, 지금 '${value}')`);
      return '00:00:00';
    }
    return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
  }

  /** YYYY-MM-DD (실제 있는 날짜) */
  date(column: string): string {
    const value = this.raw(column);
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
    if (!valid) {
      this.fail(column, `날짜는 YYYY-MM-DD 로 적어 주세요. (예: 2027-11-20, 지금 '${value}')`);
    }
    return value;
  }

  oneOf<T extends string>(column: string, allowed: readonly T[]): T {
    const value = this.raw(column);
    if (!allowed.includes(value as T)) {
      this.fail(column, `${allowed.join(' · ')} 중 하나여야 합니다. (지금 '${value}')`);
      return allowed[0];
    }
    return value as T;
  }

  matches(column: string, pattern: RegExp, message: string): void {
    const value = this.raw(column);
    if (value !== '' && !pattern.test(value)) {
      this.fail(column, message);
    }
  }

  isEmpty(column: string): boolean {
    return this.raw(column) === '';
  }

  error(column: string, message: string): void {
    this.fail(column, message);
  }
}

function checkHeader(
  file: SeedFile,
  header: string[],
  errors: string[],
): Map<string, number> | null {
  const expected: readonly string[] = SEED_FILES[file];
  const missing = expected.filter((column) => !header.includes(column));
  const extra = header.filter((column) => !expected.includes(column));
  const duplicated = header.filter((column, index) => header.indexOf(column) !== index);

  if (missing.length > 0 || extra.length > 0 || duplicated.length > 0) {
    const parts = [
      missing.length > 0 ? `없는 열: ${missing.join(', ')}` : '',
      extra.length > 0 ? `모르는 열: ${extra.join(', ')}` : '',
      duplicated.length > 0 ? `두 번 나온 열: ${duplicated.join(', ')}` : '',
    ].filter(Boolean);
    errors.push(`${file}.csv:1 헤더가 다릅니다. ${parts.join(' / ')}`);
    return null;
  }

  return new Map(header.map((column, index) => [column, index]));
}

/** 같은 키가 두 번 나오면 에러 */
function checkUnique<T>(
  items: { item: T; line: number }[],
  key: (item: T) => string,
  file: SeedFile,
  label: string,
  errors: string[],
): void {
  const seen = new Map<string, number>();
  for (const { item, line } of items) {
    const value = key(item);
    const first = seen.get(value);
    if (first !== undefined) {
      errors.push(`${file}.csv:${line} ${label} '${value}' 가 ${first}번 줄과 겹칩니다.`);
    } else {
      seen.set(value, line);
    }
  }
}

/**
 * 파일 이름 → CSV 글자를 받아서 검사해요. 에러가 하나라도 있으면 data 는 null 이에요.
 * DB가 필요한 검사(반이 실제로 있는지)는 적재할 때 해요.
 */
export function validateSeed(files: Partial<Record<SeedFile, string>>): SeedResult {
  const errors: string[] = [];
  const tables = new Map<SeedFile, { columns: Map<string, number>; records: CsvRecord[] }>();

  for (const file of Object.keys(SEED_FILES) as SeedFile[]) {
    const text = files[file];
    if (text === undefined) {
      errors.push(`${file}.csv: 파일이 없습니다.`);
      continue;
    }

    let table;
    try {
      table = parseCsv(text);
    } catch (error) {
      errors.push(`${file}.csv:${(error as Error).message}`);
      continue;
    }

    const columns = checkHeader(file, table.header, errors);
    if (!columns) continue;

    for (const record of table.records) {
      if (record.values.length !== table.header.length) {
        errors.push(
          `${file}.csv:${record.line} 열이 ${record.values.length}개입니다. 헤더는 ${table.header.length}개예요. (값에 쉼표가 있으면 큰따옴표로 감싸기)`,
        );
      }
    }

    tables.set(file, { columns, records: table.records });
  }

  const read = <T>(file: SeedFile, map: (row: RowReader) => T): { item: T; line: number }[] => {
    const table = tables.get(file);
    if (!table) return [];
    return table.records.map((record) => ({
      item: map(new RowReader(file, record, table.columns, errors)),
      line: record.line,
    }));
  };

  const buildings = read('buildings', (row) => ({
    name: row.text('name', 20),
    sortOrder: row.int('sort_order', -32768, 32767),
  }));

  const floors = read('floors', (row) => ({
    buildingName: row.text('building_name', 20),
    level: row.int('level', -32768, 32767),
    label: row.text('label', 20),
    mapImageUrl: row.text('map_image_url', 255),
    widthM: row.decimal('width_m', 0, 100_000, true),
    heightM: row.decimal('height_m', 0, 100_000, true),
  }));

  const zones = read('zones', (row) => ({
    buildingName: row.text('building_name', 20),
    floorLevel: row.int('floor_level', -32768, 32767),
    name: row.text('name', 20),
  }));

  const booths = read('booths', (row): SeedBooth => {
    row.matches('booth_code', /^\d{6}$/, '부스 코드는 숫자 6자리예요. (예: 230001)');
    const booth: SeedBooth = {
      boothCode: row.text('booth_code', 6),
      name: row.text('name', 30),
      category: row.optionalText('category', 10) ?? '기타',
      type: row.oneOf('type', ['normal', 'special'] as const),
      grade: row.optionalInt('grade', 1, 3),
      classNo: row.optionalInt('class_no', 1, 99),
      hidden: row.bool('hidden'),
      featuredOrder: row.optionalInt('featured_order', 1),
      openTime: row.time('open_time'),
      closeTime: row.time('close_time'),
      description: row.optionalText('description', 2000) ?? '',
      imageUrl: row.optionalText('image_url', 255),
    };

    // 일반 부스 ⇔ 운영 반 있음 (서버 규칙 26)
    if (booth.type === 'normal' && (booth.grade === null || booth.classNo === null)) {
      row.error('grade', '일반(normal) 부스는 운영 반의 grade · class_no 를 적어야 합니다.');
    }
    if (booth.type === 'special' && (!row.isEmpty('grade') || !row.isEmpty('class_no'))) {
      row.error('grade', '특별(special) 부스는 grade · class_no 를 비워 두세요.');
    }
    if (booth.featuredOrder !== null && booth.type !== 'special') {
      row.error('featured_order', '표시 순서는 특별(special) 부스에만 적어요.');
    }
    if (booth.openTime >= booth.closeTime) {
      row.error('close_time', '운영 끝 시각은 시작 시각보다 늦어야 합니다.');
    }
    return booth;
  });

  const menus = read('menus', (row) => ({
    boothCode: row.text('booth_code', 6),
    name: row.text('name', 30),
    description: row.optionalText('description', 40),
    price: row.int('price', 1, 100_000),
    onSale: row.bool('on_sale'),
    sortOrder: row.int('sort_order', 1),
    imageUrl: row.optionalText('image_url', 255),
  }));

  const boothLocations = read('booth_locations', (row) => ({
    boothCode: row.text('booth_code', 6),
    buildingName: row.text('building_name', 20),
    floorLevel: row.int('floor_level', -32768, 32767),
    zoneName: row.optionalText('zone_name', 20),
    x: row.decimal('x', 0, 1),
    y: row.decimal('y', 0, 1),
  }));

  const depositAccounts = read('deposit_accounts', (row) => {
    row.matches('account_no', /^[0-9-]+$/, '계좌번호는 숫자와 하이픈(-)만 적어요.');
    return {
      accountKey: row.text('account_key', 50),
      bankName: row.text('bank_name', 30),
      accountNo: row.text('account_no', 30),
      holderName: row.text('holder_name', 30),
    };
  });

  const settingsRows = read('bazaar_settings', (row): SeedSettings => {
    const settings: SeedSettings = {
      eventName: row.text('event_name', 40),
      eventStartDate: row.date('event_start_date'),
      eventEndDate: row.date('event_end_date'),
      defaultOpenTime: row.time('default_open_time'),
      defaultCloseTime: row.time('default_close_time'),
      appOpen: row.bool('app_open'),
      chargeMin: row.int('charge_min', 1),
      chargeMax: row.optionalInt('charge_max', 1),
      balanceLimit: row.optionalInt('balance_limit', 1),
      refundWindowHours: row.int('refund_window_hours', 0),
      dailyPaymentNoReset: row.bool('daily_payment_no_reset'),
      blockOldQr: row.bool('block_old_qr'),
      depositAccountKey: row.optionalText('deposit_account_key', 50),
    };
    if (settings.eventEndDate < settings.eventStartDate) {
      row.error('event_end_date', '끝 날짜는 시작 날짜와 같거나 늦어야 합니다.');
    }
    if (settings.defaultOpenTime >= settings.defaultCloseTime) {
      row.error('default_close_time', '기본 운영 끝 시각은 시작 시각보다 늦어야 합니다.');
    }
    if (settings.chargeMax !== null && settings.chargeMax < settings.chargeMin) {
      row.error('charge_max', 'charge_max 는 charge_min 보다 작을 수 없습니다.');
    }
    return settings;
  });

  if (settingsRows.length > 1) {
    errors.push(
      `bazaar_settings.csv:${settingsRows[1].line} 설정은 1행만 적어요. (DB의 설정 1행을 이 값으로 바꿔요)`,
    );
  }

  // 같은 값이 두 번 나오면 안 되는 것들
  checkUnique(buildings, (b) => b.name, 'buildings', '건물 이름', errors);
  checkUnique(floors, (f) => `${f.buildingName} ${f.level}층`, 'floors', '건물 · 층', errors);
  checkUnique(
    zones,
    (z) => `${z.buildingName} ${z.floorLevel}층 ${z.name}`,
    'zones',
    '층 · 구역',
    errors,
  );
  checkUnique(booths, (b) => b.boothCode, 'booths', '부스 코드', errors);
  checkUnique(
    booths.filter(({ item }) => item.type === 'normal'),
    (b) => `${b.grade}학년 ${b.classNo}반`,
    'booths',
    '운영 반(반당 부스 1개)',
    errors,
  );
  checkUnique(
    boothLocations,
    (l) => l.boothCode,
    'booth_locations',
    '부스 위치(부스당 1개)',
    errors,
  );
  checkUnique(depositAccounts, (a) => a.accountKey, 'deposit_accounts', 'account_key', errors);

  // 다른 파일을 가리키는 값이 그 파일에 있는지
  const buildingNames = new Set(buildings.map(({ item }) => item.name));
  const floorKeys = new Set(floors.map(({ item }) => `${item.buildingName}|${item.level}`));
  const zoneKeys = new Set(
    zones.map(({ item }) => `${item.buildingName}|${item.floorLevel}|${item.name}`),
  );
  const boothCodes = new Set(booths.map(({ item }) => item.boothCode));
  const accountKeys = new Set(depositAccounts.map(({ item }) => item.accountKey));

  for (const { item, line } of floors) {
    if (!buildingNames.has(item.buildingName)) {
      errors.push(`floors.csv:${line} buildings.csv 에 없는 건물 '${item.buildingName}'`);
    }
  }
  for (const { item, line } of zones) {
    if (!floorKeys.has(`${item.buildingName}|${item.floorLevel}`)) {
      errors.push(
        `zones.csv:${line} floors.csv 에 없는 층 '${item.buildingName} ${item.floorLevel}층'`,
      );
    }
  }
  for (const { item, line } of menus) {
    if (!boothCodes.has(item.boothCode)) {
      errors.push(`menus.csv:${line} booths.csv 에 없는 부스 코드 '${item.boothCode}'`);
    }
  }
  for (const { item, line } of boothLocations) {
    if (!boothCodes.has(item.boothCode)) {
      errors.push(`booth_locations.csv:${line} booths.csv 에 없는 부스 코드 '${item.boothCode}'`);
    }
    if (!floorKeys.has(`${item.buildingName}|${item.floorLevel}`)) {
      errors.push(
        `booth_locations.csv:${line} floors.csv 에 없는 층 '${item.buildingName} ${item.floorLevel}층'`,
      );
    }
    if (
      item.zoneName !== null &&
      !zoneKeys.has(`${item.buildingName}|${item.floorLevel}|${item.zoneName}`)
    ) {
      errors.push(`booth_locations.csv:${line} zones.csv 에 없는 구역 '${item.zoneName}'`);
    }
  }
  for (const { item, line } of settingsRows) {
    if (item.depositAccountKey !== null && !accountKeys.has(item.depositAccountKey)) {
      errors.push(
        `bazaar_settings.csv:${line} deposit_accounts.csv 에 없는 account_key '${item.depositAccountKey}'`,
      );
    }
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  const items = <T>(rows: { item: T }[]) => rows.map(({ item }) => item);

  return {
    data: {
      buildings: items(buildings),
      floors: items(floors),
      zones: items(zones),
      booths: items(booths),
      menus: items(menus),
      boothLocations: items(boothLocations),
      depositAccounts: items(depositAccounts),
      settings: settingsRows[0]?.item ?? null,
    },
    errors,
  };
}

/** 폴더에서 8개 파일을 읽어서 검사해요. */
export async function validateSeedDir(dir: string): Promise<SeedResult> {
  const files: Partial<Record<SeedFile, string>> = {};

  for (const file of Object.keys(SEED_FILES) as SeedFile[]) {
    try {
      files[file] = await readFile(path.join(dir, `${file}.csv`), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  return validateSeed(files);
}
