import { z } from 'zod';

// 서버가 쓰는 환경 변수 목록. 새 값이 필요하면 여기에 추가하고 .env.example 도 함께 고쳐요.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
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
