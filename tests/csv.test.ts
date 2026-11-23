import iconv from 'iconv-lite';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { parseCsv } from '../src/services/csv.service.js';
import { HttpError } from '../src/utils/http-error.js';

const COLUMNS = ['입금일시', '입금자명', '금액'];
const CSV =
  '입금일시,입금자명,금액\n2026-11-20 10:00,2205김민수,5000\n2026-11-20 10:05,1103이서연,3000\n';

/** 비동기 함수가 던진 에러를 꺼내요. */
async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('에러가 나야 하는데 나지 않았어요.');
}

describe('parseCsv', () => {
  it('헤더를 열 이름으로 써서 행을 객체로 돌려준다', async () => {
    const rows = await parseCsv(Buffer.from(CSV), { requiredColumns: COLUMNS });

    expect(rows).toEqual([
      { 입금일시: '2026-11-20 10:00', 입금자명: '2205김민수', 금액: '5000' },
      { 입금일시: '2026-11-20 10:05', 입금자명: '1103이서연', 금액: '3000' },
    ]);
  });

  it('엑셀이 붙이는 BOM 이 있어도 첫 열 이름이 깨지지 않는다', async () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CSV)]);

    const rows = await parseCsv(withBom, { requiredColumns: COLUMNS });
    expect(Object.keys(rows[0])).toEqual(COLUMNS);
  });

  it('EUC-KR(CP949) 로 저장된 CSV 도 한글이 깨지지 않는다', async () => {
    const rows = await parseCsv(iconv.encode(CSV, 'cp949'), { requiredColumns: COLUMNS });

    expect(rows[0]).toEqual({ 입금일시: '2026-11-20 10:00', 입금자명: '2205김민수', 금액: '5000' });
  });

  it('빈 줄은 건너뛰고 값의 앞뒤 공백은 지운다', async () => {
    const rows = await parseCsv(Buffer.from(' 입금일시 , 입금자명 ,금액\n\n a , b , 1 \n\n'), {
      requiredColumns: COLUMNS,
    });

    expect(rows).toEqual([{ 입금일시: 'a', 입금자명: 'b', 금액: '1' }]);
  });

  it('필요한 열이 없으면 400 + fields 에 빠진 열', async () => {
    const error = await errorOf(
      parseCsv(Buffer.from('입금일시,금액\n2026-11-20,5000\n'), { requiredColumns: COLUMNS }),
    );

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { 입금자명: expect.any(String) as string },
    });
  });

  it('행이 없거나 너무 많으면 400', async () => {
    expect(
      await errorOf(
        parseCsv(Buffer.from('입금일시,입금자명,금액\n'), { requiredColumns: COLUMNS }),
      ),
    ).toMatchObject({ status: 400 });

    expect(
      await errorOf(parseCsv(Buffer.from(CSV), { requiredColumns: COLUMNS, maxRows: 1 })),
    ).toMatchObject({ status: 400 });
  });

  it('따옴표가 닫히지 않는 등 형식이 깨지면 400', async () => {
    const error = await errorOf(
      parseCsv(Buffer.from('입금일시,입금자명,금액\n"2026-11-20,김민수,5000\n'), {
        requiredColumns: COLUMNS,
      }),
    );

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('이미지처럼 CSV 가 아닌 파일은 415', async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    expect(await errorOf(parseCsv(png, { requiredColumns: COLUMNS }))).toMatchObject({
      status: 415,
      code: 'VALIDATION_FAILED',
    });
  });
});