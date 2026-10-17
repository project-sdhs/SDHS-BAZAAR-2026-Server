import path from 'node:path';

import express, { Router } from 'express';

/**
 * 내려주는 이미지 확장자. 이 밖의 파일은 있어도 404 예요.
 * SVG는 안에 스크립트를 넣을 수 있어서 일부러 뺐어요.
 */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * 이미지 정적 서빙: dir 안의 이미지 파일을 경로 그대로 내려줘요.
 * 예: dir/menus/12.webp → GET /uploads/menus/12.webp (app.ts 에서 /uploads 에 연결)
 *
 * 없는 파일 · 이미지가 아닌 파일 · 폴더는 다음 미들웨어(404 JSON)로 넘겨요.
 */
export function uploadsRouter(dir: string): Router {
  const router = Router();

  router.use((req, _res, next) => {
    // 'router' 를 넘기면 이 라우터를 건너뛰고 앱의 다음 미들웨어(404)로 가요.
    next(IMAGE_EXTENSIONS.has(path.extname(req.path).toLowerCase()) ? undefined : 'router');
  });

  router.use(
    express.static(path.resolve(dir), {
      index: false, // 폴더 목록은 보여 주지 않아요
      dotfiles: 'ignore', // .env 같은 점(.) 파일은 없는 것처럼
      // 브라우저 · 앱이 하루 동안 다시 받지 않아요. 그래서 사진을 바꿀 때는 같은 이름에 덮어쓰지 말고 새 이름으로 저장해요.
      maxAge: '1d',
      setHeaders(res) {
        // 브라우저가 파일 종류를 멋대로 추측하지 않고 Content-Type 대로만 다루게 해요.
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  return router;
}
