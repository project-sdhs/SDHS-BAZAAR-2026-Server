import { describe, expect, it } from 'vitest';

import { parseCsv } from '../src/seed/csv.js';

describe('parseCsv', () => {
  it('헤더와 행을 나누고 줄 번호를 붙인다', () => {
    expect(parseCsv('name,sort_order\n본관,1\n운동장,9\n')).toEqual({
      header: ['name', 'sort_order'],
      records: [
        { line: 2, values: ['본관', '1'] },
        { line: 3, values: ['운동장', '9'] },
      ],
    });
  });

  it('엑셀 BOM · CRLF 를 받고, 빈 줄은 건너뛰고, 값 앞뒤 공백은 지운다', () => {
    expect(parseCsv('﻿name,sort_order\r\n 본관 , 1\r\n\r\n운동장,9')).toEqual({
      header: ['name', 'sort_order'],
      records: [
        { line: 2, values: ['본관', '1'] },
        { line: 4, values: ['운동장', '9'] },
      ],
    });
  });

  it('큰따옴표 안의 쉼표 · 줄바꿈 · "" 를 값으로 읽는다', () => {
    const table = parseCsv('a,b\n"겉바속촉, 4알","첫 줄\n둘째 줄"\n"말하길 ""맛있다""",x\n');

    expect(table.records).toEqual([
      { line: 2, values: ['겉바속촉, 4알', '첫 줄\n둘째 줄'] },
      { line: 4, values: ['말하길 "맛있다"', 'x'] },
    ]);
  });

  it('빈 칸은 빈 문자열이다', () => {
    expect(parseCsv('a,b,c\n1,,\n').records).toEqual([{ line: 2, values: ['1', '', ''] }]);
  });

  it('큰따옴표가 닫히지 않으면 에러', () => {
    expect(() => parseCsv('a\n"열기만\n')).toThrow('큰따옴표');
  });
});
