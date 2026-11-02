import { Router } from 'express';

import {
  createAppVersion,
  getAppVersion,
  getLatestAppVersion,
  listAppVersions,
  updateAppVersion,
} from '../controllers/app-version.controller.js';
import { validateRequest } from '../middlewares/validate-request.js';
import {
  appVersionParams,
  createAppVersionBody,
  updateAppVersionBody,
} from '../models/app-version.model.js';

export const appVersionRouter = Router();

appVersionRouter.get('/', listAppVersions);
// '/latest' 는 '/:id' 보다 먼저 등록해야 'latest' 가 id 로 잡히지 않아요.
appVersionRouter.get('/latest', getLatestAppVersion);
appVersionRouter.get('/:id', validateRequest({ params: appVersionParams }), getAppVersion);
appVersionRouter.post('/', validateRequest({ body: createAppVersionBody }), createAppVersion);
appVersionRouter.patch(
  '/:id',
  validateRequest({ params: appVersionParams, body: updateAppVersionBody }),
  updateAppVersion,
);
