import { z } from 'zod';

/** API 응답에 쓰는 앱 버전 모양 */
export interface AppVersion {
  id: number;
  /** 예: "1.2.0" */
  version: string;
  /** true 면 이 버전보다 낮은 앱은 업데이트해야 쓸 수 있어요 */
  forceUpdate: boolean;
  /** 등록한 시각 (ISO 8601, UTC) */
  createdAt: string;
  /** 마지막으로 수정한 시각 (ISO 8601, UTC) */
  updatedAt: string;
}

/** "1.2.0" 처럼 숫자.숫자.숫자 (DB 칸이 VARCHAR(20)이라 20자까지) */
const versionSchema = z
  .string({ error: 'version 은 "1.2.0" 같은 문자열로 보내 주세요.' })
  .trim()
  .max(20, 'version 은 20자까지 쓸 수 있습니다.')
  .regex(/^\d+\.\d+\.\d+$/, 'version 은 1.2.0 처럼 숫자.숫자.숫자 모양이어야 합니다.');

const forceUpdateSchema = z.boolean({ error: 'forceUpdate 는 true 또는 false 로 보내 주세요.' });

const bodyError = { error: '요청 본문은 JSON 객체로 보내 주세요.' };

/** POST /app-versions 본문. forceUpdate 를 안 보내면 false */
export const createAppVersionBody = z.object(
  {
    version: versionSchema,
    forceUpdate: forceUpdateSchema.default(false),
  },
  bodyError,
);

/** PATCH /app-versions/:id 본문. 바꿀 값만 보내요 */
export const updateAppVersionBody = z
  .object(
    {
      version: versionSchema.optional(),
      forceUpdate: forceUpdateSchema.optional(),
    },
    bodyError,
  )
  .refine((body) => body.version !== undefined || body.forceUpdate !== undefined, {
    error: 'version 이나 forceUpdate 중 하나는 보내 주세요.',
  });

/** 경로의 :id (1 이상의 정수) */
export const appVersionIdParam = z.coerce
  .number({ error: 'id 는 1 이상의 정수여야 합니다.' })
  .int('id 는 1 이상의 정수여야 합니다.')
  .positive('id 는 1 이상의 정수여야 합니다.');

export type CreateAppVersionInput = z.infer<typeof createAppVersionBody>;
export type UpdateAppVersionInput = z.infer<typeof updateAppVersionBody>;
