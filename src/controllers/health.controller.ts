import type { Request, Response } from 'express';

interface HealthResponse {
  status: 'ok';
  /** 서버가 켜진 뒤 지난 시간(초) */
  uptime: number;
  /** 응답한 시각 (ISO 8601) */
  timestamp: string;
}

/** GET /health — 서버가 살아 있는지 확인 */
export function getHealth(_req: Request, res: Response<HealthResponse>): void {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
