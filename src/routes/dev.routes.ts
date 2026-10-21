import { Router } from 'express';
import { z } from 'zod';

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/http-error.js';


export const devRouter = Router();

devRouter.get('/error', (req, res) => {
  switch (req.query.type) {
    case '400':
      throw new BadRequestError();
    case '401':
      throw new UnauthorizedError();
    case '404':
      throw new NotFoundError({ code: 'BOOTH_NOT_FOUND', message: '부스를 찾을 수 없습니다.' });
    case '409':
      throw new ConflictError({ code: 'ALREADY_PAID', message: '이미 결제된 주문입니다.' });
    case 'zod': {
      z.object({ name: z.string(), quantity: z.number().int().min(1) }).parse({ quantity: 0 });
      res.json({ ok: true });
      return;
    }
    case 'mask': {
      req.log.info(
        { password: '1234', accessToken: 'abc.def.ghi', memo: '환불계좌 3333-01-2345678' },
        '마스킹 확인',
      );
      res.json({ ok: true, message: '터미널 로그를 확인하세요.' });
      return;
    }
    default:
      throw new Error('일부러 낸 서버 에러 (내부 메시지)');
  }
});