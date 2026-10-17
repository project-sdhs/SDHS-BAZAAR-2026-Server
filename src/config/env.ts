import { z } from 'zod';

/** `PORT=` 처럼 값이 비어 있거나 공백뿐이면 "설정 안 함"(undefined)으로 바꿔서 기본값이 쓰이게 해요. */
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// 서버가 쓰는 환경 변수 목록. 새 값이 필요하면 여기에 추가하고 .env.example 도 함께 고쳐요.
const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(3000)),
  // 이미지 파일을 저장하고 /uploads 로 내려줄 폴더 (상대 경로면 서버를 실행한 위치 기준)
  UPLOAD_DIR: z.preprocess(emptyToUndefined, z.string().default('uploads')),

  // MySQL 접속 정보 (src/db/pool.ts 에서 사용). 사용자 · DB 이름은 꼭 적어야 해요.
  DB_HOST: z.preprocess(emptyToUndefined, z.string().default('127.0.0.1')),
  DB_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(3306)),
  DB_USER: z.preprocess(emptyToUndefined, z.string({ error: 'DB_USER 를 .env 에 적어 주세요.' })),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.preprocess(emptyToUndefined, z.string({ error: 'DB_NAME 을 .env 에 적어 주세요.' })),
});

export type Env = z.infer<typeof envSchema>;

/** 환경 변수를 검사해서 돌려줘요. 값이 잘못되면 어떤 값이 문제인지 알려 주는 에러를 던져요. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new Error(`환경 변수 설정이 올바르지 않습니다.\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
