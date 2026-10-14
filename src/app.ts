import express, { type Express } from 'express';

import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { router } from './routes/index.js';

/** Express 앱을 만들어요. 서버 실행(server.ts)과 테스트(tests/)에서 함께 사용해요. */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use(router);

  // 순서 중요: 라우터 → 404 → 에러 핸들러
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
