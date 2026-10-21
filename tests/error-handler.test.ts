import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { HttpError, NotFoundError, type ErrorResponse } from '../src/utils/http-error.js';

/** 테스트용: 주어진 에러를 던지는 /boom 경로만 있는 작은 앱 (pino-http 없음 → requestId 없음) */
function appThatThrows(error: unknown) {
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HttpError는 그 status와 { code, message } 로 응답한다', async () => {
    const app = appThatThrows(new HttpError(409, 'ALREADY_PAID', '이미 결제된 주문입니다.'));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'ALREADY_PAID', message: '이미 결제된 주문입니다.' });
  });

  it('알 수 없는 에러는 500 INTERNAL_SERVER_ERROR 로 응답하고 내부 메시지를 숨긴다', async () => {
    const app = appThatThrows(new Error('secret detail'));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: expect.any(String) as string,
    });
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });

  it('잘못된 JSON 본문은 400 INVALID_JSON 으로 응답한다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'INVALID_JSON',
      message: expect.any(String) as string,
      requestId: expect.any(String) as string,
    });
  });

  it('본문이 너무 크면(기본 100kb 초과) 413 PAYLOAD_TOO_LARGE 로 응답한다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: expect.any(String) as string,
      requestId: expect.any(String) as string,
    });
  });

  it('지원하지 않는 charset 이면 415 UNSUPPORTED_MEDIA_TYPE 으로 응답한다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{}');

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: expect.any(String) as string,
      requestId: expect.any(String) as string,
    });
  });

  it('status/statusCode 가 4xx 인 에러는 그 상태로, 5xx 는 500 으로 응답한다', async () => {
    const badRequest = await request(
      appThatThrows(Object.assign(new Error('bad'), { status: 400 })),
    ).get('/boom');
    expect(badRequest.status).toBe(400);
    expect(badRequest.body).toEqual({ code: 'BAD_REQUEST', message: expect.any(String) as string });

    const notAllowed = await request(
      appThatThrows(Object.assign(new Error('nope'), { statusCode: 405 })),
    ).get('/boom');
    expect(notAllowed.status).toBe(405);
    expect(notAllowed.body).toEqual({
      code: 'METHOD_NOT_ALLOWED',
      message: expect.any(String) as string,
    });

    const unavailable = await request(
      appThatThrows(Object.assign(new Error('down'), { status: 503 })),
    ).get('/boom');
    expect(unavailable.status).toBe(500);
    expect(unavailable.body).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
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

  it('요청 ID를 응답 헤더와 본문에 똑같이 넣는다', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .set('x-request-id', 'test-id-123')
      .send('{ not json');

    expect(res.headers['x-request-id']).toBe('test-id-123');
    expect(res.body).toMatchObject({ requestId: 'test-id-123' });
  });

  it('ZodError 는 400 VALIDATION_FAILED 와 필드별 이유로 응답한다', async () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 123 });
    const res = await request(appThatThrows(result.error)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: expect.any(String) as string,
      details: [{ path: 'name', message: expect.any(String) as string }],
    });
  });

  it('NotFoundError 는 기본 404 NOT_FOUND 이고 code·message 를 바꿀 수 있다', async () => {
    const basic = await request(appThatThrows(new NotFoundError())).get('/boom');
    expect(basic.status).toBe(404);
    expect(basic.body).toMatchObject({ code: 'NOT_FOUND' });

    const custom = await request(
      appThatThrows(
        new NotFoundError({ code: 'BOOTH_NOT_FOUND', message: '부스를 찾을 수 없습니다.' }),
      ),
    ).get('/boom');
    expect(custom.body).toEqual({ code: 'BOOTH_NOT_FOUND', message: '부스를 찾을 수 없습니다.' });
  });
});