/** 모든 에러 응답의 모양: { code, message } */
export interface ErrorResponse {
  code: string;
  message: string;
}

/**
 * 컨트롤러·서비스에서 throw 하면 에러 핸들러가 { code, message } JSON으로 응답해요.
 *
 * @example
 * throw new HttpError(404, 'BOOTH_NOT_FOUND', '부스를 찾을 수 없습니다.');
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
