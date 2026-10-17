import { Router } from 'express';

import { appVersionRouter } from './app-version.routes.js';
import { healthRouter } from './health.routes.js';

/** 모든 라우터를 여기서 연결해요. 새 라우터를 만들면 아래에 한 줄 추가! */
export const router = Router();

router.use('/health', healthRouter);
router.use('/app-versions', appVersionRouter);
