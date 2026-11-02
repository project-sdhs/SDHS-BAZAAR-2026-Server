import type { Request, Response } from 'express';

import {
  appVersionParams,
  createAppVersionBody,
  updateAppVersionBody,
  type AppVersion,
} from '../models/app-version.model.js';
import type { ValidatedRequestLocals } from '../middlewares/validate-request.js';
import * as appVersionService from '../services/app-version.service.js';

// Express 5 는 async 함수에서 던진 에러도 에러 핸들러로 넘겨줘요. 그래서 try/catch 가 없어도 돼요.

/** GET /app-versions — 등록된 버전 목록 (최근 순) */
export async function listAppVersions(
  _req: Request,
  res: Response<{ items: AppVersion[] }>,
): Promise<void> {
  const items = await appVersionService.listAppVersions();
  res.json({ items });
}

/** GET /app-versions/latest — 지금 앱 버전 (앱이 켜질 때 확인) */
export async function getLatestAppVersion(_req: Request, res: Response<AppVersion>): Promise<void> {
  res.json(await appVersionService.getLatestAppVersion());
}

/** GET /app-versions/:id */
export async function getAppVersion(
  _req: Request,
  res: Response<AppVersion, ValidatedRequestLocals<{ params: typeof appVersionParams }>>,
): Promise<void> {
  const { id } = res.locals.validated.params;
  res.json(await appVersionService.getAppVersion(id));
}

/** POST /app-versions — 새 버전 등록 */
export async function createAppVersion(
  _req: Request,
  res: Response<AppVersion, ValidatedRequestLocals<{ body: typeof createAppVersionBody }>>,
): Promise<void> {
  const input = res.locals.validated.body;
  res.status(201).json(await appVersionService.createAppVersion(input));
}

/** PATCH /app-versions/:id — 버전 · 강제 업데이트 여부 수정 */
export async function updateAppVersion(
  _req: Request,
  res: Response<
    AppVersion,
    ValidatedRequestLocals<{
      params: typeof appVersionParams;
      body: typeof updateAppVersionBody;
    }>
  >,
): Promise<void> {
  const { id } = res.locals.validated.params;
  const input = res.locals.validated.body;
  res.json(await appVersionService.updateAppVersion(id, input));
}
