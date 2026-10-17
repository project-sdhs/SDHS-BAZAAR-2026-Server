import type { Request, Response } from 'express';

import { pingDb } from '../db/pool.js';

type Check = 'ok' | 'error';

interface HealthResponse {
  /** 모든 항목이 ok 면 ok */
  status: Check;
  /** DB `SELECT 1` 결과 */
  db: Check;
  /** 응답한 시각 (ISO 8601, UTC) */
  time: string;
}

/**
 * GET /health — 서버와 DB가 살아 있는지 확인 (배포 · 로드밸런서용, 인증 없음)
 * 모두 정상이면 200, 하나라도 실패하면 503. (Redis 확인은 Redis 연결 티켓(DB-02)에서 추가)
 */
export async function getHealth(_req: Request, res: Response<HealthResponse>): Promise<void> {
  const db: Check = await pingDb().then(
    () => 'ok',
    () => 'error',
  );
  const status: Check = db === 'ok' ? 'ok' : 'error';

  res.status(status === 'ok' ? 200 : 503).json({ status, db, time: new Date().toISOString() });
}
