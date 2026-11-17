import express, { type Response } from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAppAuth, type AppAuthLocals } from '../src/middlewares/app-auth.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import type { User } from '../src/models/user.model.js';

// CI에는 MySQL이 없어서, 회원 저장소(repository)를 가짜로 바꿔서 테스트해요.
const fakeUsers = vi.hoisted(() => ({ findById: vi.fn() }));
vi.mock('../src/repositories/user.repository.js', () => fakeUsers);

const SECRET = 'test-secret-0123456789-abcdefghijklmnop';
const OTHER_SECRET = 'other-secret-0123456789-abcdefghijklmno';

/** 가짜 저장소에 있는 "살아 있는" 회원 */
const activeUser: User = {
  id: 1042,
  authProvider: 'google',
  authSubject: 'google-sub-1042',
  email: 'student@example.com',
  googleHostedDomain: null,
  name: '테스트 학생',
  schoolMemberId: null,
  verifiedAt: null,
  verifiedByUserId: null,
  verifiedByAdminId: null,
  depositCode: null,
  creditBalance: 0,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
};

/** 테스트용 Access 토큰을 만들어요. (실제 발급은 /auth/social · /auth/refresh 티켓) */
function signToken({
  sub = '1042',
  secret = SECRET,
  expiresAt = '30m',
}: { sub?: string; secret?: string; expiresAt?: string | number } = {}): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
}

/** requireAppAuth 뒤에 회원 id 를 그대로 돌려주는 /me 만 있는 작은 앱 */
function appWithAuth() {
  const app = express();
  app.get('/me', requireAppAuth, (_req, res: Response<{ userId: number }, AppAuthLocals>) => {
    res.json({ userId: res.locals.auth.userId });
  });
  app.use(errorHandler);
  return app;
}

const anyString = expect.any(String) as string;

describe('requireAppAuth', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', SECRET);
    fakeUsers.findById.mockImplementation((id: number) =>
      Promise.resolve(id === activeUser.id ? activeUser : null),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('올바른 토큰이면 통과하고 res.locals.auth 에 회원 정보를 담는다', async () => {
    const res = await request(appWithAuth())
      .get('/me')
      .set('Authorization', `Bearer ${await signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 1042 });
    expect(fakeUsers.findById).toHaveBeenCalledWith(1042);
  });

  it('Authorization 헤더가 없으면 401 UNAUTHORIZED', async () => {
    const res = await request(appWithAuth()).get('/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'UNAUTHORIZED', message: anyString, requestId: anyString });
    expect(fakeUsers.findById).not.toHaveBeenCalled();
  });

  it('Bearer 형식이 아니면 401 UNAUTHORIZED', async () => {
    const token = await signToken();

    for (const header of [`Basic ${token}`, token, 'Bearer', 'Bearer ']) {
      const res = await request(appWithAuth()).get('/me').set('Authorization', header);
      expect(res.status, header).toBe(401);
      expect(res.body, header).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    expect(fakeUsers.findById).not.toHaveBeenCalled();
  });

  it('다른 비밀키로 서명된(위조) 토큰이면 401 UNAUTHORIZED', async () => {
    const res = await request(appWithAuth())
      .get('/me')
      .set('Authorization', `Bearer ${await signToken({ secret: OTHER_SECRET })}`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fakeUsers.findById).not.toHaveBeenCalled();
  });

  it('만료된 토큰이면 401 TOKEN_EXPIRED', async () => {
    const oneMinuteAgo = Math.floor(Date.now() / 1000) - 60;
    const res = await request(appWithAuth())
      .get('/me')
      .set('Authorization', `Bearer ${await signToken({ expiresAt: oneMinuteAgo })}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'TOKEN_EXPIRED', message: anyString, requestId: anyString });
  });

  it('없거나 탈퇴한 회원(findById → null)이면 401 UNAUTHORIZED', async () => {
    const res = await request(appWithAuth())
      .get('/me')
      .set('Authorization', `Bearer ${await signToken({ sub: '2000' })}`);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fakeUsers.findById).toHaveBeenCalledWith(2000);
  });

  it('토큰의 sub 가 회원 id(양의 정수)가 아니면 401 UNAUTHORIZED', async () => {
    for (const sub of ['abc', '0', '-1', '1.5']) {
      const res = await request(appWithAuth())
        .get('/me')
        .set('Authorization', `Bearer ${await signToken({ sub })}`);
      expect(res.status, sub).toBe(401);
      expect(res.body, sub).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    expect(fakeUsers.findById).not.toHaveBeenCalled();
  });

  it('서버에 비밀키가 설정되지 않았으면 500 INTERNAL (서버 설정 문제)', async () => {
    const token = await signToken();
    vi.stubEnv('JWT_ACCESS_SECRET', '');

    const res = await request(appWithAuth()).get('/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL' });
  });
});
