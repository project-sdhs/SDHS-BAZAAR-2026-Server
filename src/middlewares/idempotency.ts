import { createHash } from 'node:crypto';

import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

import { logger } from '../config/logger.js';
import {
  beginIdempotentRequest,
  releaseIdempotentRequest,
  saveIdempotentResponse,
} from '../db/idempotency.js';
import { BadRequestError, ConflictError, HttpError } from '../utils/http-error.js';
import type { AppAuthLocals } from './app-auth.js';

/** 앱이 결제 · 충전 요청마다 새로 만들어 보내는 헤더 (보통 UUID) */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
/** 저장해 둔 첫 응답을 다시 보낼 때 붙이는 헤더 */
export const REPLAYED_HEADER = 'Idempotent-Replayed';

/** 영문 · 숫자 · - _ . : 만, 1~64자 */
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

/** 객체 키 순서와 상관없이 같은 내용이면 같은 문자열이 되게 바꿔요. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 같은 키로 다른 요청을 보냈는지 알아보는 값: 메서드 · 주소 · 본문의 SHA-256 */
export function requestHashOf(method: string, url: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method.toUpperCase()} ${url}\n${stableJson(body ?? null)}`)
    .digest('hex');
}

/**
 * 중복 요청 막기 (SRV-11). 결제 · 충전처럼 두 번 처리되면 안 되는 요청에 붙여요.
 * requireAppAuth (+ validateRequest) 다음에 붙여요. 사용자별로 키를 나눠요.
 *
 * - Idempotency-Key 헤더가 없거나 형식이 틀리면 400 VALIDATION_FAILED
 * - 같은 키 · 같은 요청이 처리 중이면 409 IDEMPOTENCY_IN_PROGRESS
 * - 같은 키 · 다른 요청(본문 · 주소가 다름)이면 422 VALIDATION_FAILED
 * - 같은 키 · 같은 요청이 이미 성공했으면 처리하지 않고 첫 응답을 그대로 (Idempotent-Replayed: true)
 * - 성공(2xx)한 응답만 24시간 저장해요. 실패(4xx · 5xx)하면 표시를 지워서 같은 키로 다시 시도할 수 있어요.
 *
 * @example
 * paymentRouter.post('/', requireAppAuth, validateRequest({ body }), idempotent, createPayment);
 */
export const idempotent: RequestHandler<
  ParamsDictionary,
  unknown,
  unknown,
  ParsedQs,
  AppAuthLocals
> = async (req, res, next) => {
  const key = req.get(IDEMPOTENCY_HEADER);
  if (key === undefined || !KEY_PATTERN.test(key)) {
    throw new BadRequestError({
      fields: {
        [IDEMPOTENCY_HEADER]:
          '영문 · 숫자 · - _ . : 로 된 1~64자 값이 필요해요. (요청마다 새 UUID)',
      },
    });
  }

  const { userId } = res.locals.auth;
  const requestHash = requestHashOf(req.method, req.originalUrl, req.body);
  const begin = await beginIdempotentRequest(userId, key, requestHash);

  if (begin.state === 'replay') {
    res.set(REPLAYED_HEADER, 'true').status(begin.response.statusCode).json(begin.response.body);
    return;
  }
  if (begin.state === 'processing') {
    throw new ConflictError({
      code: 'IDEMPOTENCY_IN_PROGRESS',
      message: '같은 요청을 아직 처리 중이에요. 잠시 뒤 다시 시도해 주세요.',
    });
  }
  if (begin.state === 'mismatch') {
    throw new HttpError(422, 'VALIDATION_FAILED', '이미 다른 요청에 쓴 Idempotency-Key 예요.', {
      fields: { [IDEMPOTENCY_HEADER]: '요청마다 새 값을 만들어 주세요.' },
    });
  }

  // state === 'started': 응답을 보내기 직전에 끼어들어 결과를 저장하거나 표시를 지워요.
  let settled = false;
  const sendJson = res.json.bind(res);

  res.json = (body: unknown) => {
    if (settled) {
      return sendJson(body);
    }
    settled = true;

    const statusCode = res.statusCode;
    const work =
      statusCode >= 200 && statusCode < 300
        ? saveIdempotentResponse(userId, key, requestHash, { statusCode, body })
        : releaseIdempotentRequest(userId, key, requestHash);

    // 저장이 실패해도 결제는 이미 끝났으니 응답은 보내요. (DB 의 idempotency_key 가 2차 방어)
    work
      .catch((error: unknown) => {
        logger.error({ err: error, userId, statusCode }, 'Idempotency-Key 응답 저장 실패');
      })
      .finally(() => {
        sendJson(body);
      });
    return res;
  };

  // json 을 거치지 않고 끝나거나 연결이 끊기면 표시를 지워요. (안 지워도 30초 뒤 사라져요)
  res.on('close', () => {
    if (!settled) {
      settled = true;
      releaseIdempotentRequest(userId, key, requestHash).catch((error: unknown) => {
        logger.error({ err: error, userId }, 'Idempotency-Key 표시 삭제 실패');
      });
    }
  });

  next();
};
