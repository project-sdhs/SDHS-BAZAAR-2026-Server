import { describe, expect, it } from 'vitest';

import { maskAccountNumber, maskSensitive } from '../src/utils/mask.js';

describe('maskAccountNumber', () => {
  it('하이픈 있는 계좌번호를 뒤 4자리만 남긴다', () => {
    expect(maskAccountNumber('환불계좌 3333-01-2345678')).toBe('환불계좌 ****5678');
  });

  it('날짜처럼 짧은 숫자는 그대로 둔다', () => {
    expect(maskAccountNumber('2026-10-19')).toBe('2026-10-19');
  });
});

describe('maskSensitive', () => {
  it('위험한 키는 값을 통째로 가린다 (중첩 객체 포함)', () => {
    const result = maskSensitive({
      user: 'kim',
      password: '1234',
      auth: { accessToken: 'abc.def.ghi' },
    });
    expect(result).toEqual({
      user: 'kim',
      password: '[가림]',
      auth: { accessToken: '[가림]' },
    });
  });

  it('배열 안의 값도 가린다', () => {
    expect(maskSensitive(['110-123-456789'])).toEqual(['****6789']);
  });

  it('원본 객체는 바꾸지 않는다', () => {
    const original = { password: '1234' };
    maskSensitive(original);
    expect(original.password).toBe('1234');
  });
});