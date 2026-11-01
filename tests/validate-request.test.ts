import express, { type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { errorHandler } from '../src/middlewares/error-handler.js';
import {
  validateRequest,
  type ValidatedRequestLocals,
} from '../src/middlewares/validate-request.js';

const schemas = {
  body: z.object({ name: z.string().trim() }),
  query: z.object({ limit: z.coerce.number().int().positive() }),
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
};

function createValidationApp() {
  const app = express();
  app.use(express.json());
  app.post(
    '/records/:id',
    validateRequest(schemas),
    (_req, res: Response<unknown, ValidatedRequestLocals<typeof schemas>>) => {
      const { body, query, params } = res.locals.validated;
      res.json({ name: body.name, limit: query.limit, id: params.id });
    },
  );
  app.use(errorHandler);
  return app;
}

describe('validateRequest', () => {
  it('검증·변환된 body, query, params 값을 다음 핸들러에 전달한다', async () => {
    const res = await request(createValidationApp())
      .post('/records/12?limit=3')
      .send({ name: '  Ada  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Ada', limit: 3, id: 12 });
  });

  it('잘못된 입력 위치와 필드별 이유를 공통 에러 응답으로 전달한다', async () => {
    const res = await request(createValidationApp())
      .post('/records/not-an-id?limit=zero')
      .send({ name: 7 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: {
        'body.name': expect.any(String) as string,
        'query.limit': expect.any(String) as string,
        'params.id': expect.any(String) as string,
      },
      requestId: expect.any(String) as string,
    });
  });
});
