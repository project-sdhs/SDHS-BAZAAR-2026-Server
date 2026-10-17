import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/config/env.js';

/** 꼭 적어야 하는 DB 값만 넣은 환경 변수 */
const DB_REQUIRED = { DB_USER: 'bazaar', DB_NAME: 'sdhs_bazaar' };

/** DB 값의 기본값 */
const DB_DEFAULTS = {
  UPLOAD_DIR: 'uploads',
  DB_HOST: '127.0.0.1',
  DB_PORT: 3306,
  DB_USER: 'bazaar',
  DB_PASSWORD: '',
  DB_NAME: 'sdhs_bazaar',
};

describe('loadEnv', () => {
  it('값이 없으면 기본값(PORT 3000, development, DB 127.0.0.1:3306)을 쓴다', () => {
    expect(loadEnv(DB_REQUIRED)).toEqual({ PORT: 3000, NODE_ENV: 'development', ...DB_DEFAULTS });
  });

  it('PORT · DB_PORT 문자열을 숫자로 바꾼다', () => {
    expect(
      loadEnv({ ...DB_REQUIRED, PORT: '4000', NODE_ENV: 'production', DB_PORT: '3307' }),
    ).toEqual({ PORT: 4000, NODE_ENV: 'production', ...DB_DEFAULTS, DB_PORT: 3307 });
  });

  it('PORT= 처럼 비어 있거나 공백뿐인 값은 기본값을 쓴다', () => {
    expect(loadEnv({ ...DB_REQUIRED, PORT: '', DB_HOST: '' })).toEqual({
      PORT: 3000,
      NODE_ENV: 'development',
      ...DB_DEFAULTS,
    });
    expect(loadEnv({ ...DB_REQUIRED, PORT: '   ', NODE_ENV: ' ' })).toEqual({
      PORT: 3000,
      NODE_ENV: 'development',
      ...DB_DEFAULTS,
    });
  });

  it('잘못된 값이면 에러를 던진다', () => {
    expect(() => loadEnv({ ...DB_REQUIRED, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...DB_REQUIRED, PORT: '0' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...DB_REQUIRED, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ ...DB_REQUIRED, DB_PORT: 'abc' })).toThrow(/DB_PORT/);
  });

  it('DB_USER · DB_NAME 이 없으면 에러를 던진다', () => {
    expect(() => loadEnv({})).toThrow(/DB_USER/);
    expect(() => loadEnv({ DB_USER: 'bazaar' })).toThrow(/DB_NAME/);
    expect(() => loadEnv({ DB_USER: ' ', DB_NAME: 'sdhs_bazaar' })).toThrow(/DB_USER/);
  });
});
