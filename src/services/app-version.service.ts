import type {
  AppVersion,
  CreateAppVersionInput,
  UpdateAppVersionInput,
} from '../models/app-version.model.js';
import * as appVersionRepository from '../repositories/app-version.repository.js';
import { HttpError } from '../utils/http-error.js';

const DUPLICATE_VERSION = () => new HttpError(409, 'CONFLICT', '이미 등록된 버전입니다.');

export function listAppVersions(): Promise<AppVersion[]> {
  return appVersionRepository.findAll();
}

/** 지금 앱 버전. 등록된 버전이 없으면 404 */
export async function getLatestAppVersion(): Promise<AppVersion> {
  const latest = await appVersionRepository.findLatest();
  if (!latest) {
    throw new HttpError(404, 'NOT_FOUND', '등록된 앱 버전이 없습니다.');
  }
  return latest;
}

export async function getAppVersion(id: number): Promise<AppVersion> {
  const found = await appVersionRepository.findById(id);
  if (!found) {
    throw new HttpError(404, 'NOT_FOUND', '앱 버전을 찾을 수 없습니다.');
  }
  return found;
}

export async function createAppVersion(input: CreateAppVersionInput): Promise<AppVersion> {
  // DB에 유니크 키를 두지 않기로 해서, 같은 버전이 이미 있는지 서버가 먼저 확인해요.
  if (await appVersionRepository.findByVersion(input.version)) {
    throw DUPLICATE_VERSION();
  }

  const id = await appVersionRepository.insert(input);
  return getAppVersion(id);
}

/** 보낸 값만 바꾸고, 안 보낸 값은 지금 값을 그대로 둬요 */
export async function updateAppVersion(
  id: number,
  input: UpdateAppVersionInput,
): Promise<AppVersion> {
  const current = await getAppVersion(id);
  const next = {
    version: input.version ?? current.version,
    forceUpdate: input.forceUpdate ?? current.forceUpdate,
  };

  if (
    next.version !== current.version &&
    (await appVersionRepository.findByVersion(next.version))
  ) {
    throw DUPLICATE_VERSION();
  }

  await appVersionRepository.update(id, next);
  return getAppVersion(id);
}
