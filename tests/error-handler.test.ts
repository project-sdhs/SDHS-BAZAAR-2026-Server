import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { HttpError } from '../src/utils/http-error.js';

/** 테스트용: 주어진 에러를 던지는 /boom 경로만 있는 작은 앱 */
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
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
    expect(res.body).toEqual({ code: 'INVALID_JSON', message: expect.any(String) as string });
  });
});
