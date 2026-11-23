import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { SEED_FILES, validateSeed, validateSeedDir, type SeedFile } from '../src/seed/validate.js';

const EXAMPLE_DIR = path.join(process.cwd(), 'seed-data', 'example');

let example: Record<SeedFile, string>;

beforeAll(async () => {
  const entries = await Promise.all(
    (Object.keys(SEED_FILES) as SeedFile[]).map(
      async (file) =>
        [file, await readFile(path.join(EXAMPLE_DIR, `${file}.csv`), 'utf8')] as const,
    ),
  );
  example = Object.fromEntries(entries) as Record<SeedFile, string>;
});

/** example 에서 한 파일의 글자를 바꿔서 검사 */
function validateWith(file: SeedFile, change: (text: string) => string) {
  return validateSeed({ ...example, [file]: change(example[file]) });
}

describe('validateSeed', () => {
  it('seed-data/example 은 문제 0개이고 값이 타입대로 바뀐다', async () => {
    const { data, errors } = await validateSeedDir(EXAMPLE_DIR);

    expect(errors).toEqual([]);
    expect(data?.booths[0]).toEqual({
      boothCode: '230001',
      name: '2-3 타코야끼',
      category: '분식',
      type: 'normal',
      grade: 2,
      classNo: 3,
      hidden: false,
      featuredOrder: null,
      openTime: '10:00:00',
      closeTime: '15:00:00',
      description: '겉바속촉 타코야끼, 4알 · 8알',
      imageUrl: null,
    });
    expect(data?.settings?.depositAccountKey).toBe('main');
    expect(data?.settings?.chargeMax).toBeNull();
  });

  it('파일이 없거나 헤더가 다르면 알려 준다', () => {
    const { zones: _zones, ...withoutZones } = example;

    expect(validateSeed(withoutZones).errors).toContain('zones.csv: 파일이 없습니다.');
    expect(
      validateWith('booths', (text) => text.replace('booth_code,', 'class_id,')).errors[0],
    ).toMatch(/^booths\.csv:1 헤더가 다릅니다\. 없는 열: booth_code \/ 모르는 열: class_id/);
  });

  it('부스 코드는 숫자 6자리 · 겹치지 않게', () => {
    expect(validateWith('booths', (text) => text.replace('110001', '11001')).errors).toContain(
      'booths.csv:3 booth_code: 부스 코드는 숫자 6자리예요. (예: 230001)',
    );
    expect(validateWith('booths', (text) => text.replace('110001', '230001')).errors).toContain(
      "booths.csv:3 부스 코드 '230001' 가 2번 줄과 겹칩니다.",
    );
  });

  it('일반 부스는 운영 반 필수 · 반당 1개, 특별 부스는 반을 비운다', () => {
    expect(
      validateWith('booths', (text) => text.replace('normal,2,3,', 'normal,,,')).errors,
    ).toContain(
      'booths.csv:2 grade: 일반(normal) 부스는 운영 반의 grade · class_no 를 적어야 합니다.',
    );
    expect(
      validateWith('booths', (text) => text.replace('normal,1,1,', 'normal,2,3,')).errors,
    ).toContain("booths.csv:3 운영 반(반당 부스 1개) '2학년 3반' 가 2번 줄과 겹칩니다.");
    expect(
      validateWith('booths', (text) => text.replace('special,,,', 'special,3,1,')).errors,
    ).toContain('booths.csv:4 grade: 특별(special) 부스는 grade · class_no 를 비워 두세요.');
  });

  it('시각 · 참거짓 · 숫자 범위 형식을 본다', () => {
    const errors = validateWith('booths', (text) =>
      text.replace('false,,10:00,15:00', 'no,,10시,15:00'),
    ).errors;

    expect(errors).toContain("booths.csv:2 hidden: true 또는 false 로 적어 주세요. (지금 'no')");
    expect(errors).toContain(
      "booths.csv:2 open_time: 시각은 HH:mm 로 적어 주세요. (예: 10:00, 지금 '10시')",
    );
    expect(validateWith('menus', (text) => text.replace(',2000,', ',100001,')).errors).toContain(
      "menus.csv:2 price: 1~100000 정수여야 합니다. (지금 '100001')",
    );
    expect(validateWith('booth_locations', (text) => text.replace('0.42', '1.2')).errors).toContain(
      "booth_locations.csv:2 x: 0 이상 1 이하 숫자여야 합니다. (지금 '1.2')",
    );
  });

  it('다른 파일을 가리키는 이름 · 코드가 그 파일에 있어야 한다', () => {
    expect(
      validateWith('menus', (text) => text.replace('110001,츄러스', '999999,츄러스')).errors,
    ).toContain("menus.csv:5 booths.csv 에 없는 부스 코드 '999999'");
    expect(
      validateWith('booth_locations', (text) => text.replace('복도', '강당')).errors,
    ).toContain("booth_locations.csv:2 zones.csv 에 없는 구역 '강당'");
    expect(
      validateWith('zones', (text) => text.replace('본관,2,복도', '별관,2,복도')).errors,
    ).toContain("zones.csv:3 floors.csv 에 없는 층 '별관 2층'");
    expect(
      validateWith('bazaar_settings', (text) => text.replace(/,main\n/, ',sub\n')).errors,
    ).toContain("bazaar_settings.csv:2 deposit_accounts.csv 에 없는 account_key 'sub'");
  });

  it('설정은 0행 또는 1행', () => {
    const header = example.bazaar_settings.split('\n')[0];

    expect(validateWith('bazaar_settings', () => `${header}\n`).data?.settings).toBeNull();
    expect(
      validateWith('bazaar_settings', (text) => text + text.split('\n')[1] + '\n').errors,
    ).toContain('bazaar_settings.csv:3 설정은 1행만 적어요. (DB의 설정 1행을 이 값으로 바꿔요)');
  });

  it('쉼표가 든 값을 큰따옴표로 안 감싸면 열 개수가 틀렸다고 알려 준다', () => {
    const errors = validateWith('booths', (text) =>
      text.replace('"겉바속촉 타코야끼, 4알 · 8알"', '겉바속촉 타코야끼, 4알 · 8알'),
    ).errors;

    expect(errors[0]).toMatch(/^booths\.csv:2 열이 13개입니다\. 헤더는 12개예요\./);
  });
});
