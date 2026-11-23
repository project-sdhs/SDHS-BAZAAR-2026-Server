import type { Request, Response } from 'express';

import { pingDb } from '../db/pool.js';
import { pingRedis } from '../db/redis.js';

type Check = 'ok' | 'error';

interface HealthResponse {
  status: Check;
  db: Check;
  redis: Check;
  time: string;
}

export async function getHealth(_req: Request, res: Response<HealthResponse>): Promise<void> {
  const [db, redis] = await Promise.all([
    pingDb().then(
      (): Check => 'ok',
      (): Check => 'error',
    ),
    pingRedis().then(
      (): Check => 'ok',
      (): Check => 'error',
    ),
  ]);

  const status: Check = db === 'ok' && redis === 'ok' ? 'ok' : 'error';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    db,
    redis,
    time: new Date().toISOString(),
  });
}
