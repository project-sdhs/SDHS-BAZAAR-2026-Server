import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { HttpError, type ErrorResponse, type HttpErrorBody } from '../utils/http-error.js';

const REQUEST_ID_HEADER = 'x-request-id';

/** zod 에러 중 특정 칸이 아닌 "본문 전체"에 대한 이유를 담는 키 */
const ROOT_FIELD = '_root';

/**
 * Express · body-parser 가 만든 4xx 에러를 API 문서의 code 로 바꾸는 표.
 * 413(너무 큼) · 415(형식) 도 문서에 따라 VALIDATION_FAILED 예요.
 */
const CLIENT_ERRORS: Partial<Record<number, { code: string; message: string }>> = {
  400: { code: 'VALIDATION_FAILED', message: '입력값을 확인해 주세요.' },
  401: { code: 'UNAUTHORIZED', message: '로그인이 필요해요.' },
  403: { code: 'FORBIDDEN', message: '권한이 없어요.' },
  404: { code: 'NOT_FOUND', message: '대상이나 주소가 없어요.' },
  409: { code: 'CONFLICT', message: '지금 상태와 충돌해요.' },
  413: { code: 'VALIDATION_FAILED', message: '본문이나 파일이 너무 커요.' },
  415: {
    code: 'VALIDATION_FAILED',
    message: '지원하지 않는 형식이에요. UTF-8 JSON으로 보내 주세요.',
  },
  429: { code: 'RATE_LIMITED', message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' },
};

/** 표에 없는 4xx (예: 405) */
const OTHER_CLIENT_ERROR = { code: 'VALIDATION_FAILED', message: '요청을 처리할 수 없어요.' };

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

/** zod 검증 실패를 { 'items.0.quantity': '이유' } 모양으로 바꿔요. 같은 칸의 이유는 첫 번째만 써요. */
function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.map(String).join('.') || ROOT_FIELD;
    fields[path] ??= issue.message;
  }
  return fields;
}

/**
 * 요청 ID. 보통은 request-logger(pino-http)가 붙여 둔 값을 써요.
 * 없으면(테스트용 미니 앱 등) 새로 만들어 응답 헤더에도 넣어요. API 문서상 requestId 는 필수예요.
 */
function requestIdOf(req: Request, res: Response): string {
  if (typeof req.id === 'string') {
    return req.id;
  }
  const id = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

interface ErrorBody extends HttpErrorBody {
  code: string;
  message: string;
}

/** 공통 에러 응답을 보내요. */
function sendError(
  req: Request,
  res: Response<ErrorResponse>,
  status: number,
  { code, message, fields, extra }: ErrorBody,
): void {
  res.status(status).json({
    // 추가 필드를 먼저 펼쳐요. 이름이 겹쳐도 아래 공통 필드가 이겨요.
    ...extra,
    code,
    message,
    ...(fields === undefined ? {} : { fields }),
    requestId: requestIdOf(req, res),
  });
}

/**
 * 모든 에러를 API 문서의 공통 에러 응답으로 바꿔요.
 * Express는 매개변수가 4개인 함수를 에러 핸들러로 인식하므로 next 를 지우면 안 돼요.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction,
): void {
  // 응답을 이미 보내기 시작했다면 바꿀 수 없어요. Express 기본 처리(연결 정리)에 맡겨요.
  if (res.headersSent) {
    next(err);
    return;
  }

  // 1) 우리가 만든 에러 (HttpError와 그 자식들)
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      res.err = err; // 5xx는 요청 로그에 진짜 에러를 같이 남겨요.
    }
    sendError(req, res, err.status, err);
    return;
  }

  // 2) zod 입력 검증 실패
  if (err instanceof ZodError) {
    sendError(req, res, 400, {
      code: 'VALIDATION_FAILED',
      message: '입력값을 확인해 주세요.',
      fields: zodFields(err),
    });
    return;
  }

  // 3) 깨진 JSON 본문 (문서: "깨진 JSON도 여기예요")
  if (isJsonParseError(err)) {
    sendError(req, res, 400, {
      code: 'VALIDATION_FAILED',
      message: '요청 본문이 올바른 JSON 형식이 아니에요.',
    });
    return;
  }

  // 4) 요청 쪽 잘못(4xx)은 서버 에러가 아니므로 로그 없이 그 상태 코드로 알려 줘요.
  const clientStatus = getClientErrorStatus(err);
  if (clientStatus !== undefined) {
    sendError(req, res, clientStatus, CLIENT_ERRORS[clientStatus] ?? OTHER_CLIENT_ERROR);
    return;
  }

  // 5) 나머지는 전부 서버 에러. 내부 내용은 숨기고, 진짜 에러는 요청 로그에만 남겨요.
  res.err = err instanceof Error ? err : new Error(String(err));
  sendError(req, res, 500, {
    code: 'INTERNAL',
    message: '서버 오류예요. 잠시 후 다시 시도해 주세요.',
  });
}
