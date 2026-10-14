import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('값이 없으면 기본값(PORT 3000, development)을 쓴다', () => {
    expect(loadEnv({})).toEqual({ PORT: 3000, NODE_ENV: 'development' });
  });

  it('PORT 문자열을 숫자로 바꾼다', () => {
    expect(loadEnv({ PORT: '4000', NODE_ENV: 'production' })).toEqual({
      PORT: 4000,
      NODE_ENV: 'production',
    });
  });

  it('잘못된 값이면 에러를 던진다', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
