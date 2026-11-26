import express, { type RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppAuthLocals } from '../src/middlewares/app-auth.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { idempotent, requestHashOf } from '../src/middlewares/idempotency.js';
import type { User } from '../src/models/user.model.js';
import { HttpError } from '../src/utils/http-error.js';

// CI 에는 Redis 가 없어서 저장소(DB-02)를 가짜로 바꿔요.
const store = vi.hoisted(() => ({
  beginIdempotentRequest: vi.fn(),
  saveIdempotentResponse: vi.fn(),
  releaseIdempotentRequest: vi.fn(),
}));
vi.mock('../src/db/idempotency.js', () => store);

const USER_ID = 1042;
const KEY = '5f0c2a8e-7b1d-4c3e-9a6f-2d8b1e4c7a90';

/** requireAppAuth 대신: 로그인한 회원을 res.locals.auth 에 넣어요. */
const fakeAuth: RequestHandler<ParamsDictionary, unknown, unknown, ParsedQs, AppAuthLocals> = (
  _req,
  res,
  next,
) => {
  res.locals.auth = { userId: USER_ID, user: { id: USER_ID } as User };
  next();
};

/** 결제 핸들러 흉내: 부른 횟수를 세요. */
const pay = vi.fn<RequestHandler>();

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/payments', fakeAuth, idempotent, pay);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  store.beginIdempotentRequest.mockResolvedValue({ state: 'started' });
  store.saveIdempotentResponse.mockResolvedValue(undefined);
  store.releaseIdempotentRequest.mockResolvedValue(undefined);
  pay.mockImplementation((_req, res) => {
    res.status(201).json({ id: 5821, total: 4800 });
  });
});

describe('requestHashOf', () => {
  it('키 순서가 달라도 같은 내용이면 같고, 내용 · 주소가 다르면 다르다', () => {
    const a = requestHashOf('post', '/payments', { code: 'K7', items: [{ menuId: 1, q: 2 }] });
    const b = requestHashOf('POST', '/payments', { items: [{ q: 2, menuId: 1 }], code: 'K7' });

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(requestHashOf('POST', '/payments', { code: 'K8', items: [] })).not.toBe(a);
    expect(requestHashOf('POST', '/charge-requests', { code: 'K7', items: [] })).not.toBe(
      requestHashOf('POST', '/payments', { code: 'K7', items: [] }),
    );
  });
});

describe('idempotent', () => {
  it('Idempotency-Key 가 없거나 형식이 틀리면 400 VALIDATION_FAILED, 처리하지 않는다', async () => {
    for (const key of [undefined, '', 'a'.repeat(65), 'bad/slash', 'has space']) {
      const req = request(makeApp()).post('/payments').send({ code: 'K7' });
      const res = await (key === undefined ? req : req.set('Idempotency-Key', key));

      expect(res.status, String(key)).toBe(400);
      expect(res.body, String(key)).toMatchObject({
        code: 'VALIDATION_FAILED',
        fields: { 'Idempotency-Key': expect.any(String) as string },
      });
    }
    expect(store.beginIdempotentRequest).not.toHaveBeenCalled();
    expect(pay).not.toHaveBeenCalled();
  });

  it('처음 온 요청은 처리하고, 성공 응답을 저장한 뒤 그대로 보낸다', async () => {
    const res = await request(makeApp())
      .post('/payments')
      .set('Idempotency-Key', KEY)
      .send({ code: 'K7' });

    const hash = requestHashOf('POST', '/payments', { code: 'K7' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 5821, total: 4800 });
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect(pay).toHaveBeenCalledTimes(1);
    expect(store.beginIdempotentRequest).toHaveBeenCalledWith(USER_ID, KEY, hash);
    expect(store.saveIdempotentResponse).toHaveBeenCalledWith(USER_ID, KEY, hash, {
      statusCode: 201,
      body: { id: 5821, total: 4800 },
    });
    expect(store.releaseIdempotentRequest).not.toHaveBeenCalled();
  });

  it('이미 끝난 같은 요청은 다시 처리하지 않고 첫 응답을 그대로 돌려준다', async () => {
    store.beginIdempotentRequest.mockResolvedValue({
      state: 'replay',
      response: { statusCode: 201, body: { id: 5821, total: 4800 } },
    });

    const res = await request(makeApp())
      .post('/payments')
      .set('Idempotency-Key', KEY)
      .send({ code: 'K7' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 5821, total: 4800 });
    expect(res.headers['idempotent-replayed']).toBe('true');
    expect(pay).not.toHaveBeenCalled();
    expect(store.saveIdempotentResponse).not.toHaveBeenCalled();
  });

  it('같은 요청이 처리 중이면 409 IDEMPOTENCY_IN_PROGRESS', async () => {
    store.beginIdempotentRequest.mockResolvedValue({ state: 'processing' });

    const res = await request(makeApp())
      .post('/payments')
      .set('Idempotency-Key', KEY)
      .send({ code: 'K7' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
    expect(pay).not.toHaveBeenCalled();
  });

  it('같은 키로 다른 요청을 보내면 422 VALIDATION_FAILED', async () => {
    store.beginIdempotentRequest.mockResolvedValue({ state: 'mismatch' });

    const res = await request(makeApp())
      .post('/payments')
      .set('Idempotency-Key', KEY)
      .send({ code: 'K8' });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { 'Idempotency-Key': expect.any(String) as string },
    });
    expect(pay).not.toHaveBeenCalled();
  });

  it('처리가 실패하면(4xx) 저장하지 않고 표시를 지워서 다시 시도할 수 있게 한다', async () => {
    pay.mockImplementation(() => {
      throw new HttpError(409, 'INSUFFICIENT_CREDIT', '크레딧이 부족해요.');
    });

    const res = await request(makeApp())
      .post('/payments')
      .set('Idempotency-Key', KEY)
      .send({ code: 'K7' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_CREDIT' });
    expect(store.saveIdempotentResponse).not.toHaveBeenCalled();
    expect(store.releaseIdempotentRequest).toHaveBeenCalledWith(
      USER_ID,
      KEY,
      requestHashOf('POST', '/payments', { code: 'K7' }),
    );
  });

  it('응답 저장이 실패해도 응답은 보낸다 (결제는 이미 끝났으니까)', async () => {
    store.saveIdempotentResponse.mockRejectedValue(new Error('redis down'));

    const res = await request(makeApp())
      .post('/payments')
      .set('Idempotency-Key', KEY)
      .send({ code: 'K7' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 5821, total: 4800 });
  });

  it('Redis 오류로 시작을 못 하면 처리하지 않고 500 INTERNAL', async () => {
    store.beginIdempotentRequest.mockRejectedValue(new Error('redis down'));

    const res = await request(makeApp())
      .post('/payments')
      .set('Idempotency-Key', KEY)
      .send({ code: 'K7' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL' });
    expect(pay).not.toHaveBeenCalled();
  });
});
