import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  deleteAdminSession,
  deleteAllAdminSessions,
  getAdminSession,
} from '../../src/db/admin-session.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../../src/db/redis.js';

// 다른 테스트와 겹치지 않는 관리자 id
const ADMIN_ID = 910001;
const OTHER_ADMIN_ID = 910002;

describe('DB-02 Redis 백오피스 세션', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await deleteAllAdminSessions(ADMIN_ID);
    await deleteAllAdminSessions(OTHER_ADMIN_ID);
    await disconnectRedis();
  });

  it('세션을 만들면 관리자 id · CSRF 토큰을 12시간 저장한다', async () => {
    const { sessionId, session } = await createAdminSession(ADMIN_ID);

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.adminAccountId).toBe(ADMIN_ID);
    expect(session.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.csrfToken).not.toBe(sessionId);
    expect(await getAdminSession(sessionId)).toEqual(session);

    const keys = await getRedisClient().keys('bazaar:admin-session:*');
    expect(keys.some((key) => key.endsWith(sessionId))).toBe(false); // 키에는 sid 원문 대신 해시

    const ttls = await Promise.all(keys.map((key) => getRedisClient().ttl(key)));
    for (const ttl of ttls) {
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(ADMIN_SESSION_TTL_SECONDS);
    }
  });

  it('세션 id 는 매번 다르고, 없는 세션은 null', async () => {
    const first = await createAdminSession(ADMIN_ID);
    const second = await createAdminSession(ADMIN_ID);

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.session.csrfToken).not.toBe(second.session.csrfToken);
    expect(await getAdminSession('no-such-session')).toBeNull();
  });

  it('로그아웃하면 그 세션만 지운다', async () => {
    const first = await createAdminSession(ADMIN_ID);
    const second = await createAdminSession(ADMIN_ID);

    expect(await deleteAdminSession(first.sessionId)).toBe(true);
    expect(await deleteAdminSession(first.sessionId)).toBe(false);
    expect(await getAdminSession(first.sessionId)).toBeNull();
    expect(await getAdminSession(second.sessionId)).not.toBeNull();
  });

  it('관리자 삭제 · 사용 중지 때 그 관리자의 세션을 한 번에 지운다', async () => {
    await deleteAllAdminSessions(ADMIN_ID);
    const a = await createAdminSession(ADMIN_ID);
    const b = await createAdminSession(ADMIN_ID);
    const other = await createAdminSession(OTHER_ADMIN_ID);

    expect(await deleteAllAdminSessions(ADMIN_ID)).toBe(2);
    expect(await getAdminSession(a.sessionId)).toBeNull();
    expect(await getAdminSession(b.sessionId)).toBeNull();
    expect(await getAdminSession(other.sessionId)).not.toBeNull();
    expect(await deleteAllAdminSessions(ADMIN_ID)).toBe(0);
  });

  it('잘못된 관리자 id · 빈 세션 id 는 거부한다', async () => {
    await expect(createAdminSession(0)).rejects.toThrow('관리자 ID');
    await expect(getAdminSession('')).rejects.toThrow('세션 ID');
  });
});
