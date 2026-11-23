import { createHash } from 'node:crypto';

import type { RequestHandler } from 'express';

import { findByTokenHash, touchLastSeen } from '../repositories/board-device.repository.js';
import { UnauthorizedError } from '../utils/http-error.js';

const BOARD_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BEARER_TOKEN = /^Bearer\s+(\S+)$/i;

/** 메뉴판 연결 시 발급한 토큰을 확인해요. /boards/me 와 실시간 스트림에 함께 써요. */
export const boardDeviceAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.headers.authorization;
  const match = authorization ? BEARER_TOKEN.exec(authorization) : null;
  const token = match?.[1];

  if (!token || !BOARD_TOKEN.test(token)) {
    next(new UnauthorizedError({ message: '메뉴판 기기 인증이 필요해요.' }));
    return;
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const device = await findByTokenHash(tokenHash);

  if (!device) {
    next(new UnauthorizedError({ message: '메뉴판 기기 인증 정보가 올바르지 않아요.' }));
    return;
  }

  if (device.revokedAt !== null) {
    next(
      new UnauthorizedError({
        code: 'BOARD_REPLACED',
        message: '메뉴판에 다른 기기가 연결돼서 이 기기의 토큰이 막혔어요.',
      }),
    );
    return;
  }

  await touchLastSeen(device.id);
  res.locals.boardDevice = { id: device.id, boothId: device.boothId };
  next();
};
