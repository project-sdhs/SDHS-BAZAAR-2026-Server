
import { randomUUID } from 'node:crypto';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import {
  connectRedis,
  disconnectRedis,
} from '../../src/db/redis.js';

import {
  hasRequestKey,
  reserveRequestKey,
} from '../../src/db/request-key.js';

describe('DB-02 Redis Request Key', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it('처음 등록한 요청 키는 true를 반환한다', async () => {
    const key = `test:${randomUUID()}`;

    const result = await reserveRequestKey(key, 5);

    expect(result).toBe(true);
    expect(await hasRequestKey(key)).toBe(true);
  });

  it('같은 요청 키를 중복 등록할 수 없다', async () => {
    const key = `test:${randomUUID()}`;

    const first = await reserveRequestKey(key, 5);
    const second = await reserveRequestKey(key, 5);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('TTL 만료 후 동일한 키를 다시 등록할 수 있다', async () => {
    const key = `test:${randomUUID()}`;

    const first = await reserveRequestKey(key, 1);

    expect(first).toBe(true);

    // TTL 만료를 확인하기 위해 잠시 대기
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });

    expect(await hasRequestKey(key)).toBe(false);

    const second = await reserveRequestKey(key, 5);

    expect(second).toBe(true);
  });

  it('빈 요청 키는 등록을 거부한다', async () => {
    await expect(
      reserveRequestKey(''),
    ).rejects.toThrow('요청 키가 비어 있습니다.');
  });

  it('잘못된 TTL은 등록을 거부한다', async () => {
    const key = `test:${randomUUID()}`;

    await expect(
      reserveRequestKey(key, 0),
    ).rejects.toThrow('TTL은 양의 정수여야 합니다.');
  });
});
