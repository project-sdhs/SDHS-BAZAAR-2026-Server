import { STATUS_CODES } from 'node:http';

import type { NextFunction, Request, Response } from 'express';

import { HttpError, type ErrorResponse } from '../utils/http-error.js';

/** 자주 만나는 4xx 응답. 여기에 없는 4xx는 상태 이름으로 code를 만들어요. (예: 405 → METHOD_NOT_ALLOWED) */
const CLIENT_ERRORS: Partial<Record<number, ErrorResponse>> = {
  400: { code: 'BAD_REQUEST', message: '잘못된 요청입니다.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: '요청 본문이 너무 큽니다.' },
  415: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: '지원하지 않는 요청 형식입니다. UTF-8 JSON으로 보내 주세요.',
  },
};

/** express.json()이 잘못된 JSON 본문을 받았을 때 만드는 에러인지 확인 */
function isJsonParseError(err: unknown): boolean {
  return err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed';
}

/**
 * Express · body-parser가 만든 클라이언트 에러(4xx)면 그 상태 코드를, 아니면 undefined를 돌려줘요.
 * 예: 본문이 너무 큼 → 413, 지원하지 않는 charset → 415
 */
function getClientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }

  // Express와 같은 순서로 err.status → err.statusCode 를 봐요.
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  for (const value of [status, statusCode]) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599) {
      return value <= 499 ? value : undefined;
    }
  }
  return undefined;
}

function clientErrorResponse(status: number): ErrorResponse {
  const known = CLIENT_ERRORS[status];
  if (known) {
    return known;
  }

  // 'Method Not Allowed' → 'METHOD_NOT_ALLOWED'
  const name = STATUS_CODES[status] ?? 'Client Error';
  return {
    code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    message: '요청을 처리할 수 없습니다.',
  };
}

/**
 * 모든 에러를 { code, message } JSON으로 바꿔 응답해요.
 * Express는 매개변수가 4개인 함수를 에러 핸들러로 인식하므로 next 를 지우면 안 돼요.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction,
): void {
  // 응답을 이미 보내기 시작했다면 바꿀 수 없어요. Express 기본 처리(연결 정리)에 맡겨요.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }

  if (isJsonParseError(err)) {
    res
      .status(400)
      .json({ code: 'INVALID_JSON', message: '요청 본문이 올바른 JSON 형식이 아닙니다.' });
    return;
  }

  // 요청 쪽 잘못(4xx)은 서버 에러가 아니므로 로그 없이 그 상태 코드로 알려 줘요.
  const clientStatus = getClientErrorStatus(err);
  if (clientStatus !== undefined) {
    res.status(clientStatus).json(clientErrorResponse(clientStatus));
    return;
  }

  console.error(err);
  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  });
}
