import type { Request, Response } from 'express';

import type { PublicSettings } from '../models/public-settings.model.js';
import * as publicSettingsService from '../services/public-settings.service.js';

/** GET /settings/public — 앱이 미공개 상태여도 인증 없이 조회해요. */
export async function getPublicSettings(
  _req: Request,
  res: Response<PublicSettings>,
): Promise<void> {
  res.status(200).json(await publicSettingsService.getPublicSettings());
}
