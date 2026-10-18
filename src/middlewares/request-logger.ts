import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

const REQUEST_ID_HEADER = 'x-request-id';

const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const requestLogger = pinoHttp({
  logger,

  genReqId(req, res) {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id =
      typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id); 
    return id;
  },

  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});