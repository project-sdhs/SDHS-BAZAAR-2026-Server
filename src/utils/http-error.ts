/**
 * 모든 에러 응답의 모양 (API 문서 「공통 에러 응답」)
 * { code, message, fields?, requestId, ...code 별 추가 필드 }
 */
export interface ErrorResponse {
  /** API 문서 「상태별 code」 표에 있는 값만 써요. 앱 · 웹은 이 값으로 처리를 나눠요. */
  code: string;
  /** 사람이 읽는 안내 문구. 처리 조건으로 쓰지 않아요. */
  message: string;
  /** 필드 경로 → 이유. 주로 VALIDATION_FAILED 에서 써요. 예: { 'items.0.quantity': '1 이상이어야 해요' } */
  fields?: Record<string, string>;
  /** 응답 헤더 X-Request-Id 와 같은 값. 문의할 때 이 값으로 서버 로그를 찾아요. */
  requestId: string;
  /** code 별 추가 필드 (예: INSUFFICIENT_CREDIT 의 balance · total · shortfall) */
  [extra: string]: unknown;
}

/** 에러 응답에 붙는 선택 값 */
export interface HttpErrorBody {
  /** 필드별 이유 → 응답의 fields */
  fields?: Record<string, string> | undefined;
  /** 응답 맨 바깥에 그대로 붙는 추가 필드 */
  extra?: Record<string, unknown> | undefined;
}

/** 아래 에러 클래스들에 넘기는 값. 전부 생략하면 기본값을 써요. */
export interface HttpErrorOptions extends HttpErrorBody {
  code?: string;
  message?: string;
}

/**
 * 컨트롤러 · 서비스에서 throw 하면 에러 핸들러가 공통 에러 응답으로 바꿔요.
 * 보통은 아래의 NotFoundError, ConflictError 같은 클래스를 쓰면 돼요.
 *
 * @example
 * throw new HttpError(404, 'QR_INVALID', '없는 QR 코드예요.');
 * throw new HttpError(409, 'INSUFFICIENT_CREDIT', '크레딧이 부족해요.', {
 *   extra: { balance: 3000, total: 5000, shortfall: 2000 },
 * });
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;
  readonly extra: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    { fields, extra }: HttpErrorBody = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.extra = extra;
  }
}

/** 400 VALIDATION_FAILED */
export class BadRequestError extends HttpError {
  constructor({
    code = 'VALIDATION_FAILED',
    message = '입력값을 확인해 주세요.',
    ...body
  }: HttpErrorOptions = {}) {
    super(400, code, message, body);
    this.name = 'BadRequestError';
  }
}

/** 401 UNAUTHORIZED */
export class UnauthorizedError extends HttpError {
  constructor({
    code = 'UNAUTHORIZED',
    message = '로그인이 필요해요.',
    ...body
  }: HttpErrorOptions = {}) {
    super(401, code, message, body);
    this.name = 'UnauthorizedError';
  }
}

/** 403 FORBIDDEN */
export class ForbiddenError extends HttpError {
  constructor({ code = 'FORBIDDEN', message = '권한이 없어요.', ...body }: HttpErrorOptions = {}) {
    super(403, code, message, body);
    this.name = 'ForbiddenError';
  }
}

/** 404 NOT_FOUND */
export class NotFoundError extends HttpError {
  constructor({
    code = 'NOT_FOUND',
    message = '대상이나 주소가 없어요.',
    ...body
  }: HttpErrorOptions = {}) {
    super(404, code, message, body);
    this.name = 'NotFoundError';
  }
}

/** 409 CONFLICT */
export class ConflictError extends HttpError {
  constructor({
    code = 'CONFLICT',
    message = '지금 상태와 충돌해요.',
    ...body
  }: HttpErrorOptions = {}) {
    super(409, code, message, body);
    this.name = 'ConflictError';
  }
}

/** 429 RATE_LIMITED */
export class TooManyRequestsError extends HttpError {
  constructor({
    code = 'RATE_LIMITED',
    message = '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
    ...body
  }: HttpErrorOptions = {}) {
    super(429, code, message, body);
    this.name = 'TooManyRequestsError';
  }
}

/** 500 INTERNAL */
export class InternalServerError extends HttpError {
  constructor({
    code = 'INTERNAL',
    message = '서버 오류예요. 잠시 후 다시 시도해 주세요.',
    ...body
  }: HttpErrorOptions = {}) {
    super(500, code, message, body);
    this.name = 'InternalServerError';
  }
}
