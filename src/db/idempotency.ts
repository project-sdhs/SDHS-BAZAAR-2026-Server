import { readyRedis } from './redis.js';

/**
 * Idempotency-Key 저장소 (결제 · 충전 요청). ERD "DB 밖에 두는 것" · 서버 규칙 10 · 16
 *
 * Redis는 1차 방어예요. 키는 사용자별 (user_id, Idempotency-Key) 로 나눠요.
 * - 처리 중 표시: 30초. 같은 키가 처리 중이면 두 번째 요청은 409.
 * - 첫 응답: 처리가 끝나면 상태 코드 · 본문을 24시간 보관. 같은 키 · 같은 본문이면 그 응답을 그대로 돌려줘요.
 * - 같은 키 · 다른 본문(request_hash 가 다름)이면 422.
 * Redis가 지워져도 이중 결제가 안 되게, 서버는 사용자 행을 잠근 뒤 payments · charge_requests 에서
 * 같은 (user_id, idempotency_key) 를 한 번 더 찾아요. (영구 방어는 DB)
 *
 * @example
 * const begin = await beginIdempotentRequest(userId, key, requestHash);
 * if (begin.state === 'replay') return res.status(begin.response.statusCode).json(begin.response.body);
 * if (begin.state === 'processing') → 409, if (begin.state === 'mismatch') → 422
 * // state === 'started': 처리하고, 응답을 보내기 전에 saveIdempotentResponse(...)
 * // 처리 중 예상 못 한 에러로 끝나면 releaseIdempotentRequest(...) 로 표시를 지워서 다시 시도할 수 있게
 */

const KEY_PREFIX = 'bazaar:idempotency:';

export const IDEMPOTENCY_PROCESSING_TTL_SECONDS = 30;
export const IDEMPOTENCY_RESPONSE_TTL_SECONDS = 24 * 60 * 60;

/** 같은 키로 다시 온 요청에 돌려줄 첫 응답 */
export interface StoredResponse {
  statusCode: number;
  body: unknown;
}

export type BeginResult =
  /** 처음 온 요청: 처리를 시작해요. */
  | { state: 'started' }
  /** 같은 키 · 같은 본문이 아직 처리 중: 409 */
  | { state: 'processing' }
  /** 같은 키 · 같은 본문이 이미 끝남: 첫 응답 그대로 */
  | { state: 'replay'; response: StoredResponse }
  /** 같은 키 · 다른 본문: 422 */
  | { state: 'mismatch' };

type StoredValue =
  | { state: 'processing'; requestHash: string }
  | { state: 'done'; requestHash: string; response: StoredResponse };

/** 키가 없을 때만 처리 중 표시를 넣고, 이미 있으면 들어 있던 값을 돌려줘요. (확인과 저장을 한 번에) */
const BEGIN_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  return current
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return false
`;

/** 값이 아직 이 요청의 처리 중 표시일 때만 지워요. (이미 저장된 첫 응답은 지우지 않게) */
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

function redisKey(userId: number, idempotencyKey: string): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('사용자 ID는 양의 정수여야 합니다.');
  }

  if (!idempotencyKey.trim() || idempotencyKey.length > 64) {
    throw new Error('Idempotency-Key 는 1~64자여야 합니다.');
  }

  return `${KEY_PREFIX}${userId}:${idempotencyKey}`;
}

function checkRequestHash(requestHash: string): void {
  if (!/^[0-9a-f]{64}$/.test(requestHash)) {
    throw new Error('request_hash 는 SHA-256 hex 64자여야 합니다.');
  }
}

function processingValue(requestHash: string): string {
  const value: StoredValue = { state: 'processing', requestHash };
  return JSON.stringify(value);
}

/** 요청을 처리하기 전에 불러요. 결과에 따라 처리 · 409 · 422 · 첫 응답 재전송을 골라요. */
export async function beginIdempotentRequest(
  userId: number,
  idempotencyKey: string,
  requestHash: string,
): Promise<BeginResult> {
  const key = redisKey(userId, idempotencyKey);
  checkRequestHash(requestHash);

  const existing = await readyRedis().eval(BEGIN_SCRIPT, {
    keys: [key],
    arguments: [processingValue(requestHash), String(IDEMPOTENCY_PROCESSING_TTL_SECONDS)],
  });

  if (existing === null) {
    return { state: 'started' };
  }

  if (typeof existing !== 'string') {
    throw new Error('Redis 응답 형식이 올바르지 않습니다.');
  }

  const stored = JSON.parse(existing) as StoredValue;

  if (stored.requestHash !== requestHash) {
    return { state: 'mismatch' };
  }

  if (stored.state === 'processing') {
    return { state: 'processing' };
  }

  return { state: 'replay', response: stored.response };
}

/** 처리가 끝나면, 응답을 보내기 전에 불러요. 처리 중 표시를 첫 응답으로 바꾸고 24시간 보관해요. */
export async function saveIdempotentResponse(
  userId: number,
  idempotencyKey: string,
  requestHash: string,
  response: StoredResponse,
): Promise<void> {
  const key = redisKey(userId, idempotencyKey);
  checkRequestHash(requestHash);

  if (
    !Number.isInteger(response.statusCode) ||
    response.statusCode < 100 ||
    response.statusCode > 599
  ) {
    throw new Error('상태 코드가 올바르지 않습니다.');
  }

  const value: StoredValue = { state: 'done', requestHash, response };

  await readyRedis().set(key, JSON.stringify(value), {
    EX: IDEMPOTENCY_RESPONSE_TTL_SECONDS,
  });
}

/** 처리 중 예상 못 한 에러로 끝났을 때 불러요. 처리 중 표시를 지워서 같은 키로 다시 시도할 수 있게 해요. */
export async function releaseIdempotentRequest(
  userId: number,
  idempotencyKey: string,
  requestHash: string,
): Promise<void> {
  const key = redisKey(userId, idempotencyKey);
  checkRequestHash(requestHash);

  await readyRedis().eval(RELEASE_SCRIPT, {
    keys: [key],
    arguments: [processingValue(requestHash)],
  });
}
