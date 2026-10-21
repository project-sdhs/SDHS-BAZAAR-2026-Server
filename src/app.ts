import express, { type Express } from 'express';

import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { requestLogger } from './middlewares/request-logger.js';
import { uploadsRouter } from './middlewares/uploads.js';
import { devRouter } from './routes/dev.routes.js';
import { router } from './routes/index.js';

export interface AppOptions {
  /** 이미지 파일을 두는 폴더. 기본값은 실행한 위치의 uploads/ (.env 의 UPLOAD_DIR) */
  uploadDir?: string;
}

/** Express 앱을 만들어요. 서버 실행(server.ts)과 테스트(tests/)에서 함께 사용해요. */
export function createApp({ uploadDir = 'uploads' }: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');

  // 요청 ID · 요청 로그. express.json() 보다 먼저 와야 JSON 파싱 에러에도 요청 ID가 붙어요.
  app.use(requestLogger);
  app.use(express.json());

  // 이미지 정적 서빙: uploads/menus/12.webp → GET /uploads/menus/12.webp
  app.use('/uploads', uploadsRouter(uploadDir));

  app.use(router);

  // 개발 · 테스트에서만: 에러 응답과 로그를 눈으로 확인하는 라우트
  if (process.env.NODE_ENV !== 'production') {
    app.use('/dev', devRouter);
  }

  // 순서 중요: 라우터 → 404 → 에러 핸들러
  app.use(notFound);
  app.use(errorHandler);

  return app;
}