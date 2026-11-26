import { Router } from 'express';

import { getPublicSettings } from '../controllers/public-settings.controller.js';

export const publicSettingsRouter = Router();

publicSettingsRouter.get('/public', getPublicSettings);
