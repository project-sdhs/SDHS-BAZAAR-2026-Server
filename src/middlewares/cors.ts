import cors from 'cors';
import type { RequestHandler } from 'express';

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'];
const EXPOSED_HEADERS = ['X-Request-Id', 'Retry-After'];

export function createCorsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const origins = new Set(allowedOrigins);

  return cors({
    origin(origin, callback) {
      callback(null, origin !== undefined && origins.has(origin));
    },
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
  });
}
