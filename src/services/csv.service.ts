import { parse } from 'csv-parse/sync';
import { fileTypeFromBuffer } from 'file-type';
import iconv from 'iconv-lite';

import { BadRequestError, HttpError } from '../utils/http-error.js';

/** 한 번에 읽는 최대 행 수 (헤더 제외) */
export const CSV_MAX_ROWS = 5000;

export interface ParseCsvOptions {
  /** 첫 줄(헤더)에 꼭 있어야 하는 열 이름 */
  requiredColumns: readonly string[];
  maxRows?: number;
}

/** 한 행 = { 열 이름: 값 } (값은 앞뒤 공백을 지운 문자열) */
export type CsvRow = Record<string, string>;

/**
 * CSV 파일 바이트를 글자로 바꿔요.
 * UTF-8 로 먼저 읽어 보고, UTF-8 이 아니면 EUC-KR(CP949)로 읽어요. (한국 은행 · 엑셀 CSV 가 보통 CP949)
 * UTF-8 BOM(엑셀이 붙이는 보이지 않는 글자)은 TextDecoder 가 지워 줘요.
 */
export function decodeCsv(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, 'cp949');
  }
}

/**
 * 올린 CSV 를 검사해서 행 배열로 돌려줘요.
 * - 이미지 · 엑셀(.xlsx) 같은 다른 파일 → 415
 * - 형식 오류 · 필요한 열 없음 · 행이 너무 많음 · 행이 없음 → 400
 * 각 행의 값 검사(금액이 숫자인지 등)는 쓰는 쪽에서 zod 로 해요.
 *
 * @example
 * const rows = await parseCsv(uploadedFile(req).buffer, { requiredColumns: ['입금일시', '입금자명', '금액'] });
 */
export async function parseCsv(
  buffer: Buffer,
  { requiredColumns, maxRows = CSV_MAX_ROWS }: ParseCsvOptions,
): Promise<CsvRow[]> {
  // CSV 는 글자 파일이라 file-type 이 알아보지 못해요. 알아보면 다른 종류의 파일이에요.
  const type = await fileTypeFromBuffer(buffer);
  if (type || buffer.includes(0)) {
    const message =
      type?.ext === 'xlsx' || type?.ext === 'xls' || type?.ext === 'cfb'
        ? '엑셀 파일은 "CSV UTF-8" 형식으로 저장해서 올려 주세요.'
        : 'CSV 파일만 올릴 수 있어요.';
    throw new HttpError(415, 'VALIDATION_FAILED', message);
  }

  let header: string[] = [];
  let rows: CsvRow[];
  try {
    rows = parse<CsvRow>(decodeCsv(buffer), {
      bom: true,
      columns: (names: string[]) => {
        header = names.map((name) => name.trim());
        return header;
      },
      skip_empty_lines: true,
      trim: true,
      // 한 줄 더 읽어서 "너무 많음"을 알아내요. 그 뒤는 읽지 않아요.
      to: maxRows + 1,
    });
  } catch {
    throw new BadRequestError({
      message: 'CSV 형식이 올바르지 않아요. 따옴표 · 쉼표 · 열 개수를 확인해 주세요.',
    });
  }

  const missing = requiredColumns.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new BadRequestError({
      message: `CSV 첫 줄에 필요한 열이 없어요: ${missing.join(', ')}`,
      fields: Object.fromEntries(missing.map((column) => [column, '이 열이 필요해요.'])),
    });
  }

  if (rows.length === 0) {
    throw new BadRequestError({ message: 'CSV 에 내용(행)이 없어요.' });
  }

  if (rows.length > maxRows) {
    throw new BadRequestError({
      message: `CSV 는 한 번에 ${maxRows}행까지 올릴 수 있어요. 나눠서 올려 주세요.`,
    });
  }

  return rows;
}