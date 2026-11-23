import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  beginIdempotentRequest,
  IDEMPOTENCY_PROCESSING_TTL_SECONDS,
  IDEMPOTENCY_RESPONSE_TTL_SECONDS,
  releaseIdempotentRequest,
  saveIdempotentResponse,
} from '../../src/db/idempotency.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../../src/db/redis.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const USER_ID = 900001;
const OTHER_USER_ID = 900002;

const usedKeys: string[] = [];

function newKey(): string {
  const key = randomUUID();
  usedKeys.push(key);
  return key;
}

describe('DB-02 Redis Idempotency-Key', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    const keys = usedKeys.flatMap((key) => [
      `bazaar:idempotency:${USER_ID}:${key}`,
      `bazaar:idempotency:${OTHER_USER_ID}:${key}`,
    ]);
    await getRedisClient().del(keys);
    await disconnectRedis();
  });

  it('처음 온 요청은 started, 처리 중 표시는 30초', async () => {
    const key = newKey();

    expect(await beginIdempotentRequest(USER_ID, key, HASH_A)).toEqual({ state: 'started' });

    const ttl = await getRedisClient().ttl(`bazaar:idempotency:${USER_ID}:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(IDEMPOTENCY_PROCESSING_TTL_SECONDS);
  });

  it('같은 키 · 같은 본문이 처리 중이면 processing (409)', async () => {
    const key = newKey();
    await beginIdempotentRequest(USER_ID, key, HASH_A);

    expect(await beginIdempotentRequest(USER_ID, key, HASH_A)).toEqual({ state: 'processing' });
  });

  it('같은 키 · 다른 본문이면 mismatch (422) — 처리 중이어도, 끝난 뒤에도', async () => {
    const key = newKey();
    await beginIdempotentRequest(USER_ID, key, HASH_A);

    expect(await beginIdempotentRequest(USER_ID, key, HASH_B)).toEqual({ state: 'mismatch' });

    await saveIdempotentResponse(USER_ID, key, HASH_A, { statusCode: 201, body: { id: 1 } });

    expect(await beginIdempotentRequest(USER_ID, key, HASH_B)).toEqual({ state: 'mismatch' });
  });

  it('끝난 요청은 첫 응답(상태 코드 · 본문)을 그대로 돌려주고 24시간 보관', async () => {
    const key = newKey();
    const response = { statusCode: 201, body: { paymentId: 42, paymentNo: 7, balance: 7000 } };

    await beginIdempotentRequest(USER_ID, key, HASH_A);
    await saveIdempotentResponse(USER_ID, key, HASH_A, response);

    expect(await beginIdempotentRequest(USER_ID, key, HASH_A)).toEqual({
      state: 'replay',
      response,
    });

    const ttl = await getRedisClient().ttl(`bazaar:idempotency:${USER_ID}:${key}`);
    expect(ttl).toBeGreaterThan(IDEMPOTENCY_PROCESSING_TTL_SECONDS);
    expect(ttl).toBeLessThanOrEqual(IDEMPOTENCY_RESPONSE_TTL_SECONDS);
  });

  it('같은 키라도 사용자가 다르면 따로 본다', async () => {
    const key = newKey();
    await beginIdempotentRequest(USER_ID, key, HASH_A);

    expect(await beginIdempotentRequest(OTHER_USER_ID, key, HASH_B)).toEqual({
      state: 'started',
    });
  });

  it('release 는 처리 중 표시만 지워서 다시 시도할 수 있게 하고, 저장된 응답은 지우지 않는다', async () => {
    const key = newKey();
    await beginIdempotentRequest(USER_ID, key, HASH_A);
    await releaseIdempotentRequest(USER_ID, key, HASH_A);

    expect(await beginIdempotentRequest(USER_ID, key, HASH_A)).toEqual({ state: 'started' });

    await saveIdempotentResponse(USER_ID, key, HASH_A, { statusCode: 201, body: {} });
    await releaseIdempotentRequest(USER_ID, key, HASH_A);

    expect((await beginIdempotentRequest(USER_ID, key, HASH_A)).state).toBe('replay');
  });

  it('잘못된 사용자 ID · 키 · 해시는 거부한다', async () => {
    await expect(beginIdempotentRequest(0, newKey(), HASH_A)).rejects.toThrow('사용자 ID');
    await expect(beginIdempotentRequest(USER_ID, '', HASH_A)).rejects.toThrow('Idempotency-Key');
    await expect(beginIdempotentRequest(USER_ID, newKey(), 'abc')).rejects.toThrow('request_hash');
  });
});
