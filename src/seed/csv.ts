/** CSV 한 줄(레코드)과 파일 안의 줄 번호 (헤더가 1번) */
export interface CsvRecord {
  line: number;
  values: string[];
}

export interface CsvTable {
  header: string[];
  records: CsvRecord[];
}

/**
 * CSV 글자를 표로 바꿔요. (RFC 4180)
 * - 엑셀이 붙이는 BOM, CRLF · LF 줄바꿈을 받아요.
 * - 쉼표 · 줄바꿈이 들어간 값은 큰따옴표로 감싸고, 값 안의 큰따옴표는 "" 로 적어요.
 * - 값의 앞뒤 공백은 지우고, 완전히 빈 줄은 건너뛰어요.
 */
export function parseCsv(text: string): CsvTable {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: CsvRecord[] = [];

  let values: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endField = () => {
    values.push(field.trim());
    field = '';
  };

  const endRow = () => {
    endField();
    if (values.some((value) => value !== '')) {
      rows.push({ line: rowLine, values });
    }
    values = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error(`${rowLine}번 줄: 큰따옴표가 닫히지 않았습니다.`);
  }

  if (field !== '' || values.length > 0) {
    endRow();
  }

  const [header, ...records] = rows;
  return { header: header?.values ?? [], records };
}
