/** 모든 에러 응답의 모양: { code, message, requestId?, details? } */
export interface ErrorResponse {
  code: string;
  message: string;
  /** 요청 ID. 문의할 때 이 값을 알려 주면 서버 로그에서 바로 찾을 수 있어요. */
  requestId?: string;
  /** 추가 정보 (예: 입력 검증 실패 시 필드별 이유) */
  details?: unknown;
}

/**
 * 컨트롤러·서비스에서 throw 하면 에러 핸들러가 JSON으로 응답해요.
 * 보통은 아래의 BadRequestError, NotFoundError 같은 클래스를 쓰면 돼요.
 *
 * @example
 * throw new HttpError(404, 'BOOTH_NOT_FOUND', '부스를 찾을 수 없습니다.');
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 아래 에러 클래스들에 넘기는 값. 전부 생략하면 기본값을 써요. */
export interface HttpErrorOptions {
  code?: string;
  message?: string;
  details?: unknown;
}

/**
 * @example
 * throw new BadRequestError();
 * throw new BadRequestError({ code: 'INVALID_QUANTITY', message: '수량은 1개 이상이어야 합니다.' });
 */
export class BadRequestError extends HttpError {
  constructor({ code = 'BAD_REQUEST', message = '잘못된 요청입니다.', details }: HttpErrorOptions = {}) {
    super(400, code, message, details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor({ code = 'UNAUTHORIZED', message = '로그인이 필요합니다.', details }: HttpErrorOptions = {}) {
    super(401, code, message, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends HttpError {
  constructor({ code = 'FORBIDDEN', message = '권한이 없습니다.', details }: HttpErrorOptions = {}) {
    super(403, code, message, details);
    this.name = 'ForbiddenError';
  }
}

/**
 * @example
 * throw new NotFoundError({ code: 'BOOTH_NOT_FOUND', message: '부스를 찾을 수 없습니다.' });
 */
export class NotFoundError extends HttpError {
  constructor({ code = 'NOT_FOUND', message = '요청한 대상을 찾을 수 없습니다.', details }: HttpErrorOptions = {}) {
    super(404, code, message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor({ code = 'CONFLICT', message = '요청이 현재 상태와 충돌합니다.', details }: HttpErrorOptions = {}) {
    super(409, code, message, details);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends HttpError {
  constructor({
    code = 'TOO_MANY_REQUESTS',
    message = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    details,
  }: HttpErrorOptions = {}) {
    super(429, code, message, details);
    this.name = 'TooManyRequestsError';
  }
}

export class InternalServerError extends HttpError {
  constructor({
    code = 'INTERNAL_SERVER_ERROR',
    message = '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    details,
  }: HttpErrorOptions = {}) {
    super(500, code, message, details);
    this.name = 'InternalServerError';
  }
}