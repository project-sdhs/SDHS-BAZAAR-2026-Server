import express, { type Express } from 'express';

import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { uploadsRouter } from './middlewares/uploads.js';
import { router } from './routes/index.js';

export interface AppOptions {
  /** 이미지 파일을 두는 폴더. 기본값은 실행한 위치의 uploads/ (.env 의 UPLOAD_DIR) */
  uploadDir?: string;
}

/** Express 앱을 만들어요. 서버 실행(server.ts)과 테스트(tests/)에서 함께 사용해요. */
export function createApp({ uploadDir = 'uploads' }: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  // 이미지 정적 서빙: uploads/menus/12.webp → GET /uploads/menus/12.webp
  app.use('/uploads', uploadsRouter(uploadDir));

  app.use(router);

  // 순서 중요: 라우터 → 404 → 에러 핸들러
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
