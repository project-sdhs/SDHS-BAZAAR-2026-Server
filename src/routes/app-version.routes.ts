import { Router } from 'express';

import {
  createAppVersion,
  getAppVersion,
  getLatestAppVersion,
  listAppVersions,
  updateAppVersion,
} from '../controllers/app-version.controller.js';

export const appVersionRouter = Router();

appVersionRouter.get('/', listAppVersions);
// '/latest' 는 '/:id' 보다 먼저 등록해야 'latest' 가 id 로 잡히지 않아요.
appVersionRouter.get('/latest', getLatestAppVersion);
appVersionRouter.get('/:id', getAppVersion);
appVersionRouter.post('/', createAppVersion);
appVersionRouter.patch('/:id', updateAppVersion);
