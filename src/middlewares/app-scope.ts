import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

import type { AppScope, BoothRole } from '../models/app-scope.model.js';
import { canManageClass, canOperateBooth, computeAppScope } from '../services/app-scope.service.js';
import { BadRequestError, ForbiddenError } from '../utils/http-error.js';
import type { AppAuthLocals } from './app-auth.js';

/** requireAppAuth → loadAppScope 를 지난 요청의 res.locals */
export interface AppScopeLocals extends AppAuthLocals {
  scope: AppScope;
}

type ScopeHandler = RequestHandler<ParamsDictionary, unknown, unknown, ParsedQs, AppScopeLocals>;

/**
 * requireAppAuth 다음에 붙여서 역할 · 범위를 계산해 res.locals.scope 에 담아요. (요청마다)
 *
 * @example
 * boothRouter.patch('/:boothId/pause', requireAppAuth, loadAppScope, requireBoothRole('boothId'), pauseBooth);
 */
export const loadAppScope: ScopeHandler = async (_req, res, next) => {
  res.locals.scope = await computeAppScope(res.locals.auth.user);
  next();
};

/** 경로의 :param 을 양의 정수 id 로 바꿔요. 아니면 400 */
function idParam(params: ParamsDictionary, name: string): number {
  const value = params[name];
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new BadRequestError({ fields: { [name]: 'id 는 1 이상의 정수여야 해요.' } });
  }
  return Number(value);
}

/**
 * 경로의 부스(:param)를 운영할 수 있어야 통과해요. 아니면 403 FORBIDDEN
 * roles 를 주면 그 역할만 허용해요. (예: 캐셔 지정은 반장 · 선생님만 → ['class_leader', 'teacher'])
 */
export function requireBoothRole(param = 'boothId', roles?: readonly BoothRole[]): ScopeHandler {
  return (req, res, next) => {
    if (!canOperateBooth(res.locals.scope, idParam(req.params, param), roles)) {
      throw new ForbiddenError({ message: '이 부스를 운영할 권한이 없어요.' });
    }
    next();
  };
}

/** 경로의 반(:param)의 반장 · 담당 선생님이어야 통과해요. 아니면 403 FORBIDDEN */
export function requireClassRole(param = 'classId'): ScopeHandler {
  return (req, res, next) => {
    if (!canManageClass(res.locals.scope, idParam(req.params, param))) {
      throw new ForbiddenError({ message: '이 반을 관리할 권한이 없어요.' });
    }
    next();
  };
}
