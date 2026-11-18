
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
  createSession,
  getSession,
  deleteSession,
  refreshSession,
} from '../../src/db/session.js';

describe('DB-02 Redis Session', () => {
  const tokens: string[] = [];

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    // 테스트가 실패하더라도 생성한 세션을 정리
    for (const token of tokens) {
      await deleteSession(token);
    }

    await disconnectRedis();
  });

  it('세션을 생성하고 조회할 수 있다', async () => {
    const token = await createSession('test-user-1', 30);
    tokens.push(token);

    const session = await getSession(token);

    expect(session).not.toBeNull();
    expect(session?.userId).toBe('test-user-1');
    expect(session?.createdAt).toEqual(expect.any(String));
  });

  it('존재하지 않는 세션은 null을 반환한다', async () => {
    const session = await getSession('not-existing-token');

    expect(session).toBeNull();
  });

  it('세션 토큰은 매번 다르게 생성된다', async () => {
    const first = await createSession('test-user-2', 30);
    const second = await createSession('test-user-2', 30);

    tokens.push(first, second);

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('세션 만료 시간을 갱신할 수 있다', async () => {
    const token = await createSession('test-user-3', 5);
    tokens.push(token);

    const updated = await refreshSession(token, 30);

    expect(updated).toBe(true);
    expect(await getSession(token)).not.toBeNull();
  });

  it('존재하지 않는 세션은 갱신할 수 없다', async () => {
    const result = await refreshSession('not-existing-token', 30);

    expect(result).toBe(false);
  });

  it('세션을 삭제하면 다시 조회할 수 없다', async () => {
    const token = await createSession('test-user-4', 30);
    tokens.push(token);

    expect(await deleteSession(token)).toBe(true);
    expect(await getSession(token)).toBeNull();
  });

  it('TTL이 만료되면 세션이 자동으로 삭제된다', async () => {
    const token = await createSession('test-user-5', 1);
    tokens.push(token);

    expect(await getSession(token)).not.toBeNull();

    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });

    expect(await getSession(token)).toBeNull();
  });

  it('빈 사용자 ID는 거부한다', async () => {
    await expect(
      createSession('', 30),
    ).rejects.toThrow('사용자 ID가 비어 있습니다.');
  });

  it('잘못된 TTL은 거부한다', async () => {
    await expect(
      createSession('test-user', 0),
    ).rejects.toThrow('세션 TTL은 양의 정수여야 합니다.');
  });
});
