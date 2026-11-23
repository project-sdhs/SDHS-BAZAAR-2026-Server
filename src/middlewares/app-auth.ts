import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { errors, jwtVerify, type JWTPayload } from 'jose';
import type { ParsedQs } from 'qs';

import { getAccessTokenSecret } from '../config/auth.js';
import type { User } from '../models/user.model.js';
import * as userRepository from '../repositories/user.repository.js';
import { UnauthorizedError } from '../utils/http-error.js';

/** 인증을 통과한 요청에서 컨트롤러가 쓰는 값 (res.locals.auth) */
export interface AppAuth {
  userId: number;
  user: User;
}

export interface AppAuthLocals {
  auth: AppAuth;
}

/** Authorization: Bearer <토큰>  ('Bearer' 는 대소문자를 가리지 않아요) */
const BEARER_TOKEN = /^Bearer\s+(\S+)$/i;

/** 토큰의 sub 는 회원 id 를 담은 양의 정수 문자열이에요. (예: "1042") */
const USER_ID = /^[1-9]\d*$/;

/** Authorization 헤더에서 토큰만 꺼내요. 없거나 모양이 틀리면 401 UNAUTHORIZED */
function readBearerToken(header: string | undefined): string {
  const match = BEARER_TOKEN.exec(header ?? '');
  if (!match) {
    throw new UnauthorizedError();
  }
  return match[1];
}

/**
 * 토큰의 서명(HS256)과 만료를 확인하고 회원 id 를 돌려줘요.
 * 만료 → 401 TOKEN_EXPIRED (앱은 /auth/refresh 를 한 번 부르고 다시 시도해요)
 * 위조 · 형식 오류 → 401 UNAUTHORIZED
 */
async function verifyAccessToken(token: string): Promise<number> {
  // 비밀키 설정이 잘못됐으면 여기서 일반 에러가 나요 → 500 INTERNAL (서버 설정 문제라서)
  const secret = getAccessTokenSecret();

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] }));
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new UnauthorizedError({ code: 'TOKEN_EXPIRED', message: 'Access 토큰이 만료됐어요.' });
    }
    throw new UnauthorizedError();
  }

  const { sub } = payload;
  if (sub === undefined || !USER_ID.test(sub)) {
    throw new UnauthorizedError();
  }

  const userId = Number(sub);
  if (!Number.isSafeInteger(userId)) {
    throw new UnauthorizedError();
  }
  return userId;
}

/**
 * 앱 로그인이 필요한 API 앞에 붙이는 미들웨어.
 * 통과하면 컨트롤러에서 res.locals.auth.userId · res.locals.auth.user 를 쓸 수 있어요.
 *
 * @example
 * meRouter.get('/', requireAppAuth, getMe);
 */
export const requireAppAuth: RequestHandler<
  ParamsDictionary,
  unknown,
  unknown,
  ParsedQs,
  AppAuthLocals
> = async (req, res, next) => {
  const userId = await verifyAccessToken(readBearerToken(req.get('authorization')));

  // findById 는 deleted_at 이 있는(탈퇴한) 회원이면 null 을 돌려줘요. (DB-04 user.repository)
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new UnauthorizedError({ message: '없거나 탈퇴한 계정이에요. 다시 로그인해 주세요.' });
  }

  res.locals.auth = { userId, user };
  next();
};
