import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { pinoHttp } from 'pino-http';

import { logger } from '../config/logger.js';
import { maskAccountNumber } from '../utils/mask.js';

const REQUEST_ID_HEADER = 'x-request-id';
// 클라이언트가 보낸 요청 ID는 영문·숫자·-·_ 로 된 64자 이하만 믿어요.
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** 로그에 남기는 요청 정보 (pino-http 가 미리 정리해서 넘겨줘요) */
interface SerializedRequest {
  id: string | number;
  method: string;
  url: string;
}

/** 로그에 남기는 응답 정보 */
interface SerializedResponse {
  statusCode: number;
}

/**
 * 로그에 쓸 경로. 라우터를 거치면 req.url 이 잘려서(/health → /) originalUrl 을 먼저 봐요.
 * 계좌번호 같은 긴 숫자는 가려요.
 */
function pathOf(req: IncomingMessage): string {
  const url =
    'originalUrl' in req && typeof req.originalUrl === 'string' ? req.originalUrl : (req.url ?? '');
  return maskAccountNumber(url);
}

export const requestLogger = pinoHttp({
  logger,

  // 요청마다 번호표(요청 ID)를 정하고, 응답 헤더에도 같은 번호를 적어 줘요.
  genReqId(req, res) {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id =
      typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },

  // 로그에 남길 항목을 직접 골라요. 헤더 전체는 남기지 않아요. (토큰 노출 방지)
  serializers: {
    req(req: SerializedRequest) {
      return { id: req.id, method: req.method, url: maskAccountNumber(req.url) };
    },
    res(res: SerializedResponse) {
      return { statusCode: res.statusCode };
    },
  },

  // 결과에 따라 로그 레벨을 나눠요.
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  // 메시지를 "GET /health → 503"처럼 한눈에 보이게 만들어요.
  customSuccessMessage(req, res) {
    return `${req.method ?? ''} ${pathOf(req)} → ${String(res.statusCode)}`;
  },
  customErrorMessage(req, res) {
    return `${req.method ?? ''} ${pathOf(req)} → ${String(res.statusCode)}`;
  },
});
