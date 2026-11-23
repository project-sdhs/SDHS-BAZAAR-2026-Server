import { timingSafeEqual } from 'node:crypto';

import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

import { getAdminWebOrigins } from '../config/admin.js';
import {
  ADMIN_SESSION_TTL_SECONDS,
  deleteAdminSession,
  getAdminSession,
  type AdminSession,
} from '../db/admin-session.js';
import type { AdminAccount } from '../models/admin-account.model.js';
import * as adminAccountRepository from '../repositories/admin-account.repository.js';
import { ForbiddenError, UnauthorizedError } from '../utils/http-error.js';

/** 세션 id(sid)를 담는 쿠키 이름 */
export const ADMIN_SESSION_COOKIE = 'bazaar_admin_sid';

/** 백오피스가 바꾸는 요청(POST · PUT · PATCH · DELETE)마다 보내야 하는 CSRF 토큰 헤더 */
export const CSRF_HEADER = 'x-csrf-token';

/** createAdminSession 이 만드는 sid 모양 (32바이트 → base64url 43자) */
const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

/** 읽기만 하는 요청. 이 밖의 메서드는 Origin · CSRF 토큰을 확인해요. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 인증을 통과한 요청에서 컨트롤러가 쓰는 값 (res.locals.admin) */
export interface AdminAuth {
  account: AdminAccount;
  session: AdminSession;
  sessionId: string;
}

export interface AdminAuthLocals {
  admin: AdminAuth;
}

/** 세션 쿠키 설정. 로그인(set) · 로그아웃(clear)에서 같은 값을 써야 브라우저가 지워요. */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true, // 화면의 JavaScript 가 쿠키를 읽지 못하게 (XSS 로 세션을 훔쳐 가지 못하게)
    secure: process.env.NODE_ENV === 'production', // 운영에서는 https 로만 보내요
    sameSite: 'lax', // 다른 사이트에서 보내는 POST 에는 쿠키가 붙지 않아요
    path: '/',
  };
}

/** 로그인 성공 뒤: 세션 쿠키를 심어요. (세션과 같은 12시간 뒤 만료) */
export function setAdminSessionCookie(res: Response, sessionId: string): void {
  res.cookie(ADMIN_SESSION_COOKIE, sessionId, {
    ...cookieOptions(),
    maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
  });
}

/** 로그아웃 · 세션이 없을 때: 세션 쿠키를 지워요. */
export function clearAdminSessionCookie(res: Response): void {
  res.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions());
}

/** Cookie 헤더에서 이름이 name 인 값을 꺼내요. (cookie-parser 없이) */
function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return undefined;
}

/** 요청이 어느 사이트에서 왔는지: Origin 헤더, 없으면 Referer 의 origin */
function requestOrigin(req: Request): string | undefined {
  const origin = req.get('origin');
  if (origin) {
    return origin;
  }

  const referer = req.get('referer');
  if (!referer) {
    return undefined;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/** 두 문자열을 걸리는 시간이 같게 비교해요. (응답 시간으로 토큰을 한 글자씩 알아내지 못하게) */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * CSRF(사이트 간 요청 위조) 막기: 바꾸는 요청은 두 가지를 모두 확인해요.
 * 1. Origin(없으면 Referer)이 ADMIN_WEB_ORIGINS 에 있는 백오피스 주소인지
 * 2. X-CSRF-Token 헤더가 이 세션의 csrfToken 과 같은지 (로그인 응답 · GET /admin/me 로 받은 값)
 */
function checkCsrf(req: Request, session: AdminSession): void {
  const origin = requestOrigin(req);
  if (!origin || !getAdminWebOrigins().has(origin)) {
    throw new ForbiddenError({ message: '허용되지 않은 곳에서 온 요청이에요.' });
  }

  const token = req.get(CSRF_HEADER);
  if (!token || !safeEqual(token, session.csrfToken)) {
    throw new ForbiddenError({
      message: 'CSRF 토큰이 맞지 않아요. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
    });
  }
}

/**
 * 백오피스 API 앞에 붙이는 미들웨어.
 * - 쿠키의 sid 로 Redis 세션을 찾고, 관리자 계정이 아직 쓸 수 있는지(삭제 · 사용 중지 아님) 확인해요.
 * - POST · PUT · PATCH · DELETE 는 Origin 과 CSRF 토큰까지 확인해요.
 * 통과하면 컨트롤러에서 res.locals.admin.account · session 을 써요.
 *
 * @example
 * adminRouter.use(requireAdminSession);
 */
export const requireAdminSession: RequestHandler<
  ParamsDictionary,
  unknown,
  unknown,
  ParsedQs,
  AdminAuthLocals
> = async (req, res, next) => {
  const sessionId = readCookie(req.headers.cookie, ADMIN_SESSION_COOKIE);
  if (!sessionId || !SESSION_ID.test(sessionId)) {
    throw new UnauthorizedError();
  }

  const session = await getAdminSession(sessionId);
  if (!session) {
    // 만료됐거나 로그아웃된 세션: 브라우저에 남은 쿠키도 지워요.
    clearAdminSessionCookie(res);
    throw new UnauthorizedError({ message: '로그인이 만료됐어요. 다시 로그인해 주세요.' });
  }

  // findById 는 삭제된(deleted_at) 계정이면 null 이에요. 사용 중지(disabled_at)도 함께 막아요.
  const account = await adminAccountRepository.findById(session.adminAccountId);
  if (!account || account.disabledAt !== null) {
    await deleteAdminSession(sessionId);
    clearAdminSessionCookie(res);
    throw new UnauthorizedError({ message: '사용할 수 없는 관리자 계정이에요.' });
  }

  if (!SAFE_METHODS.has(req.method)) {
    checkCsrf(req, session);
  }

  res.locals.admin = { account, session, sessionId };
  next();
};
