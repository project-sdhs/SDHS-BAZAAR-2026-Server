import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { HttpError, NotFoundError, type ErrorResponse } from '../src/utils/http-error.js';

/** 테스트용: 주어진 에러를 던지는 /boom 경로만 있는 작은 앱 (pino-http 없음) */
function appThatThrows(error: unknown) {
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

const anyString = expect.any(String) as string;

describe('errorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HttpError는 그 status와 { code, message, requestId } 로 응답한다', async () => {
    const app = appThatThrows(new HttpError(409, 'CONFLICT', '지금 상태와 충돌해요.'));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'CONFLICT',
      message: '지금 상태와 충돌해요.',
      requestId: anyString,
    });
  });

  it('HttpError 의 extra 는 응답 맨 바깥에 붙고, code · message 를 덮어쓰지 못한다', async () => {
    const app = appThatThrows(
      new HttpError(409, 'INSUFFICIENT_CREDIT', '크레딧이 부족해요.', {
        extra: { balance: 3000, total: 5000, shortfall: 2000, code: 'HACKED' },
      }),
    );

    const res = await request(app).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'INSUFFICIENT_CREDIT',
      message: '크레딧이 부족해요.',
      balance: 3000,
      total: 5000,
      shortfall: 2000,
      requestId: anyString,
    });
  });

  it('알 수 없는 에러는 500 INTERNAL 로 응답하고 내부 메시지를 숨긴다', async () => {
    const app = appThatThrows(new Error('secret detail'));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL', message: anyString, requestId: anyString });
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });

  it('잘못된 JSON 본문은 400 VALIDATION_FAILED 로 응답한다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: anyString,
      requestId: anyString,
    });
  });

  it('본문이 너무 크면(기본 100kb 초과) 413 VALIDATION_FAILED 로 응답한다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: anyString,
      requestId: anyString,
    });
  });

  it('지원하지 않는 charset 이면 415 VALIDATION_FAILED 로 응답한다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{}');

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: anyString,
      requestId: anyString,
    });
  });

  it('status/statusCode 가 4xx 인 에러는 그 상태로, 5xx 는 500 으로 응답한다', async () => {
    const badRequest = await request(
      appThatThrows(Object.assign(new Error('bad'), { status: 400 })),
    ).get('/boom');
    expect(badRequest.status).toBe(400);
    expect(badRequest.body).toMatchObject({ code: 'VALIDATION_FAILED' });

    const notAllowed = await request(
      appThatThrows(Object.assign(new Error('nope'), { statusCode: 405 })),
    ).get('/boom');
    expect(notAllowed.status).toBe(405);
    expect(notAllowed.body).toMatchObject({ code: 'VALIDATION_FAILED' });

    const tooMany = await request(
      appThatThrows(Object.assign(new Error('slow down'), { status: 429 })),
    ).get('/boom');
    expect(tooMany.status).toBe(429);
    expect(tooMany.body).toMatchObject({ code: 'RATE_LIMITED' });

    const unavailable = await request(
      appThatThrows(Object.assign(new Error('down'), { status: 503 })),
    ).get('/boom');
    expect(unavailable.status).toBe(500);
    expect(unavailable.body).toMatchObject({ code: 'INTERNAL' });
  });

  it('응답을 이미 보내기 시작했으면 직접 응답하지 않고 next(err) 로 넘긴다', () => {
    const err = new Error('late');
    const status = vi.fn();
    const next = vi.fn();
    const res = { headersSent: true, status } as unknown as Response<ErrorResponse>;

    errorHandler(err, {} as Request, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(status).not.toHaveBeenCalled();
  });

  it('요청에 보낸 X-Request-Id 를 응답 헤더와 본문에 똑같이 넣는다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .set('x-request-id', 'test-id-123')
      .send('{ not json');

    expect(res.get('x-request-id')).toBe('test-id-123');
    expect(res.body).toMatchObject({ requestId: 'test-id-123' });
  });

  it('요청 로거가 없어도 requestId 를 만들어 헤더와 본문에 넣는다', async () => {
    const res = await request(appThatThrows(new NotFoundError())).get('/boom');

    expect(res.get('x-request-id')).toEqual(anyString);
    expect(res.body).toMatchObject({ requestId: res.get('x-request-id') });
  });

  it('ZodError 는 400 VALIDATION_FAILED 와 fields(필드 경로 → 이유)로 응답한다', async () => {
    const schema = z.object({
      name: z.string(),
      items: z.array(z.object({ quantity: z.number().min(1) })),
    });
    const result = schema.safeParse({ name: 123, items: [{ quantity: 0 }] });
    const res = await request(appThatThrows(result.error)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: anyString,
      fields: { name: anyString, 'items.0.quantity': anyString },
      requestId: anyString,
    });
  });

  it('NotFoundError 는 기본 404 NOT_FOUND 이고 code · message 를 바꿀 수 있다', async () => {
    const basic = await request(appThatThrows(new NotFoundError())).get('/boom');
    expect(basic.status).toBe(404);
    expect(basic.body).toMatchObject({ code: 'NOT_FOUND' });

    const custom = await request(
      appThatThrows(new NotFoundError({ code: 'QR_INVALID', message: '없는 QR 코드예요.' })),
    ).get('/boom');
    expect(custom.body).toEqual({
      code: 'QR_INVALID',
      message: '없는 QR 코드예요.',
      requestId: anyString,
    });
  });
});
