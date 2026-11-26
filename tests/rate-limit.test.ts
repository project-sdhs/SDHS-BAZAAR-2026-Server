import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../src/middlewares/error-handler.js';
import { clientIpKey, createRateLimitMiddleware } from '../src/middlewares/rate-limit.js';

type AuthLocals = Record<string, unknown> & { auth: { userId: number } };

const { checkRateLimit } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('../src/db/rate-limit.js', () => ({ checkRateLimit }));

function createTestApp() {
  const app = express();
  app.get(
    '/limited',
    createRateLimitMiddleware({
      scope: 'test',
      limit: 2,
      windowSeconds: 60,
      key: clientIpKey,
    }),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

describe('createRateLimitMiddleware', () => {
  it('passes requests below the configured limit and uses a scoped client key', async () => {
    checkRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 1,
      retryAfterSeconds: 0,
    });

    const response = await request(createTestApp()).get('/limited');

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith(expect.stringMatching(/^test:.+/), 2, 60);
  });

  it('allows authenticated routes to use the verified user identity as their key', async () => {
    checkRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      remaining: 1,
      retryAfterSeconds: 0,
    });

    const app = express();
    app.use((_req, res, next) => {
      res.locals.auth = { userId: 42 };
      next();
    });
    app.get(
      '/limited',
      createRateLimitMiddleware<AuthLocals>({
        scope: 'payment',
        limit: 2,
        windowSeconds: 60,
        key: (_req, res) => `user:${res.locals.auth.userId}`,
      }),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    app.use(errorHandler);

    const response = await request(app).get('/limited');

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith('payment:user:42', 2, 60);
  });

  it('returns the standard 429 response and Retry-After when the limit is exceeded', async () => {
    checkRateLimit.mockResolvedValue({
      allowed: false,
      count: 3,
      remaining: 0,
      retryAfterSeconds: 17,
    });

    const response = await request(createTestApp()).get('/limited');

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('17');
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('forwards Redis failures to the shared error handler', async () => {
    checkRateLimit.mockRejectedValue(new Error('Redis unavailable'));

    const response = await request(createTestApp()).get('/limited');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: 'INTERNAL' });
  });
});
