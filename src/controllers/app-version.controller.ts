import type { Request, Response } from 'express';
import type { z } from 'zod';

import {
  appVersionIdParam,
  createAppVersionBody,
  updateAppVersionBody,
  type AppVersion,
} from '../models/app-version.model.js';
import * as appVersionService from '../services/app-version.service.js';
import { HttpError } from '../utils/http-error.js';

/**
 * zod 스키마로 검사해서 통과한 값을 돌려줘요. 틀리면 400 VALIDATION_FAILED 를 던져요.
 * (입력 검증 미들웨어(SRV-04)가 생기면 그쪽으로 옮겨요)
 */
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_FAILED', result.error.issues[0].message);
  }
  return result.data;
}

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
  req: Request<{ id: string }>,
  res: Response<AppVersion>,
): Promise<void> {
  const id = parse(appVersionIdParam, req.params.id);
  res.json(await appVersionService.getAppVersion(id));
}

/** POST /app-versions — 새 버전 등록 */
export async function createAppVersion(req: Request, res: Response<AppVersion>): Promise<void> {
  const input = parse(createAppVersionBody, req.body);
  res.status(201).json(await appVersionService.createAppVersion(input));
}

/** PATCH /app-versions/:id — 버전 · 강제 업데이트 여부 수정 */
export async function updateAppVersion(
  req: Request<{ id: string }>,
  res: Response<AppVersion>,
): Promise<void> {
  const id = parse(appVersionIdParam, req.params.id);
  const input = parse(updateAppVersionBody, req.body);
  res.json(await appVersionService.updateAppVersion(id, input));
}
