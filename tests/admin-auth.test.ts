import express, { type Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAdminWebOrigins } from '../src/config/admin.js';
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  CSRF_HEADER,
  requireAdminSession,
  setAdminSessionCookie,
  type AdminAuthLocals,
} from '../src/middlewares/admin-auth.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import type { AdminAccount } from '../src/models/admin-account.model.js';

// CI에는 Redis · MySQL이 없어서, 세션 저장소와 관리자 저장소를 가짜로 바꿔서 테스트해요.
const sessions = vi.hoisted(() => ({
  ADMIN_SESSION_TTL_SECONDS: 12 * 60 * 60,
  getAdminSession: vi.fn(),
  deleteAdminSession: vi.fn(),
}));
vi.mock('../src/db/admin-session.js', () => sessions);

const accounts = vi.hoisted(() => ({ findById: vi.fn() }));
vi.mock('../src/repositories/admin-account.repository.js', () => accounts);

const ADMIN_WEB = 'http://localhost:5173';
const SESSION_ID = 'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7dE9f'; // 43자
const CSRF_TOKEN = 'cSrF0123456789abcdefghijklmnopqrstuvwxyzABC';
const SESSION_COOKIE = `${ADMIN_SESSION_COOKIE}=${SESSION_ID}`;

const session = { adminAccountId: 7, csrfToken: CSRF_TOKEN, createdAt: '2026-11-23T00:00:00.000Z' };

const admin: AdminAccount = {
  id: 7,
  email: 'jaewon@example.com',
  name: '이재원',
  role: 'class_leader',
  scopeAll: false,
  canReviewPayments: false,
  canReviewCharges: false,
  userId: 1042,
  disabledAt: null,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
};

/** requireAdminSession 뒤에 관리자 id 를 돌려주는 /admin/me (GET · POST)만 있는 작은 앱 */
function appWithAdminAuth() {
  const app = express();
  const handler = (_req: express.Request, res: Response<{ id: number }, AdminAuthLocals>) => {
    res.json({ id: res.locals.admin.account.id });
  };
  app.get('/admin/me', requireAdminSession, handler);
  app.post('/admin/me', requireAdminSession, handler);
  app.use(errorHandler);
  return app;
}

/** Set-Cookie 헤더들을 배열로 */
function setCookies(res: request.Response): string[] {
  const value: unknown = res.headers['set-cookie'];
  return Array.isArray(value) ? value.map(String) : [];
}

describe('requireAdminSession', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_WEB_ORIGINS', ADMIN_WEB);
    sessions.getAdminSession.mockImplementation((id: string) =>
      Promise.resolve(id === SESSION_ID ? session : null),
    );
    sessions.deleteAdminSession.mockResolvedValue(true);
    accounts.findById.mockImplementation((id: number) =>
      Promise.resolve(id === admin.id ? admin : null),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('세션 쿠키가 있으면 GET 은 CSRF 토큰 없이 통과한다', async () => {
    const res = await request(appWithAdminAuth()).get('/admin/me').set('Cookie', SESSION_COOKIE);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7 });
    expect(sessions.getAdminSession).toHaveBeenCalledWith(SESSION_ID);
    expect(accounts.findById).toHaveBeenCalledWith(7);
  });

  it('다른 쿠키와 섞여 있어도 세션 쿠키만 골라 읽는다', async () => {
    const res = await request(appWithAdminAuth())
      .get('/admin/me')
      .set('Cookie', `theme=dark; ${SESSION_COOKIE}; lang=ko`);

    expect(res.status).toBe(200);
  });

  it('쿠키가 없거나 모양이 틀리면 Redis 를 조회하지 않고 401 UNAUTHORIZED', async () => {
    for (const cookie of [undefined, `${ADMIN_SESSION_COOKIE}=short`, 'other=1']) {
      const req = request(appWithAdminAuth()).get('/admin/me');
      const res = await (cookie ? req.set('Cookie', cookie) : req);
      expect(res.status, String(cookie)).toBe(401);
      expect(res.body, String(cookie)).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    expect(sessions.getAdminSession).not.toHaveBeenCalled();
  });

  it('만료 · 로그아웃된 세션이면 401 이고 쿠키를 지운다', async () => {
    sessions.getAdminSession.mockResolvedValue(null);

    const res = await request(appWithAdminAuth()).get('/admin/me').set('Cookie', SESSION_COOKIE);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(setCookies(res).join()).toMatch(
      new RegExp(`${ADMIN_SESSION_COOKIE}=;.*Expires=Thu, 01 Jan 1970`),
    );
  });

  it('삭제 · 사용 중지된 관리자 계정이면 세션을 지우고 401', async () => {
    accounts.findById.mockResolvedValueOnce(null);
    const deleted = await request(appWithAdminAuth())
      .get('/admin/me')
      .set('Cookie', SESSION_COOKIE);

    accounts.findById.mockResolvedValueOnce({ ...admin, disabledAt: '2026-11-20T00:00:00.000Z' });
    const disabled = await request(appWithAdminAuth())
      .get('/admin/me')
      .set('Cookie', SESSION_COOKIE);

    for (const res of [deleted, disabled]) {
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    expect(sessions.deleteAdminSession).toHaveBeenCalledTimes(2);
    expect(sessions.deleteAdminSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('POST 는 백오피스 Origin 과 맞는 CSRF 토큰이 있으면 통과한다', async () => {
    const res = await request(appWithAdminAuth())
      .post('/admin/me')
      .set('Cookie', SESSION_COOKIE)
      .set('Origin', ADMIN_WEB)
      .set(CSRF_HEADER, CSRF_TOKEN);

    expect(res.status).toBe(200);
  });

  it('Origin 이 없으면 Referer 의 주소로 확인한다', async () => {
    const res = await request(appWithAdminAuth())
      .post('/admin/me')
      .set('Cookie', SESSION_COOKIE)
      .set('Referer', `${ADMIN_WEB}/booths/23`)
      .set(CSRF_HEADER, CSRF_TOKEN);

    expect(res.status).toBe(200);
  });

  it('POST 인데 Origin · Referer 가 없거나 다른 사이트면 403 FORBIDDEN', async () => {
    const noOrigin = await request(appWithAdminAuth())
      .post('/admin/me')
      .set('Cookie', SESSION_COOKIE)
      .set(CSRF_HEADER, CSRF_TOKEN);

    const otherSite = await request(appWithAdminAuth())
      .post('/admin/me')
      .set('Cookie', SESSION_COOKIE)
      .set('Origin', 'https://evil.example.com')
      .set(CSRF_HEADER, CSRF_TOKEN);

    for (const res of [noOrigin, otherSite]) {
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('POST 인데 CSRF 토큰이 없거나 틀리면 403 FORBIDDEN', async () => {
    for (const token of [undefined, 'wrong-token', `${CSRF_TOKEN}x`]) {
      const req = request(appWithAdminAuth())
        .post('/admin/me')
        .set('Cookie', SESSION_COOKIE)
        .set('Origin', ADMIN_WEB);
      const res = await (token ? req.set(CSRF_HEADER, token) : req);

      expect(res.status, String(token)).toBe(403);
      expect(res.body, String(token)).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('Redis 오류는 공통 500 INTERNAL 로 전달한다', async () => {
    sessions.getAdminSession.mockRejectedValue(new Error('Redis 연결이 준비되지 않았습니다.'));

    const res = await request(appWithAdminAuth()).get('/admin/me').set('Cookie', SESSION_COOKIE);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL' });
  });
});

describe('세션 쿠키 설정', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function cookieApp() {
    const app = express();
    app.get('/login', (_req, res) => {
      setAdminSessionCookie(res, SESSION_ID);
      res.end();
    });
    app.get('/logout', (_req, res) => {
      clearAdminSessionCookie(res);
      res.end();
    });
    return app;
  }

  it('로그인 쿠키는 HttpOnly · SameSite=Lax · 12시간', async () => {
    const [cookie] = setCookies(await request(cookieApp()).get('/login'));

    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=${SESSION_ID}`);
    expect(cookie).toContain('Max-Age=43200');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('운영(production)에서는 Secure 를 붙여 https 로만 보낸다', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const [cookie] = setCookies(await request(cookieApp()).get('/login'));
    expect(cookie).toContain('Secure');
  });

  it('로그아웃은 같은 이름 · 경로의 쿠키를 지운다', async () => {
    const [cookie] = setCookies(await request(cookieApp()).get('/logout'));

    expect(cookie).toMatch(
      new RegExp(`^${ADMIN_SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970`),
    );
  });
});

describe('getAdminWebOrigins', () => {
  it('쉼표로 나눈 주소를 origin 으로 바꾼다 (끝의 / · 경로는 버림)', () => {
    const origins = getAdminWebOrigins({
      ADMIN_WEB_ORIGINS: 'http://localhost:5173/, https://admin.example.com/login',
    });

    expect([...origins]).toEqual(['http://localhost:5173', 'https://admin.example.com']);
  });

  it('비어 있거나 주소 모양이 아니면 에러', () => {
    expect(() => getAdminWebOrigins({})).toThrow(/ADMIN_WEB_ORIGINS/);
    expect(() => getAdminWebOrigins({ ADMIN_WEB_ORIGINS: ' , ' })).toThrow(/ADMIN_WEB_ORIGINS/);
    expect(() => getAdminWebOrigins({ ADMIN_WEB_ORIGINS: 'admin.example.com' })).toThrow(
      /주소 모양/,
    );
    expect(() => getAdminWebOrigins({ ADMIN_WEB_ORIGINS: 'ftp://admin.example.com' })).toThrow(
      /http/,
    );
  });
});