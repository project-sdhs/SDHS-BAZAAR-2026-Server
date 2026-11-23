/**
 * 앱 Access 토큰(JWT) 설정.
 *
 * env.ts 의 loadEnv() 는 DB_USER · DB_NAME 이 꼭 있어야 해서, DB 없이 도는 테스트에서 쓰기 어려워요.
 * 그래서 토큰 비밀키는 필요한 순간에 따로 읽어요. 서버를 켤 때 server.ts 에서 한 번 확인해요.
 */

/** HS256 비밀키 최소 길이. 256비트(32바이트) 이상을 권장해요. */
const MIN_SECRET_LENGTH = 32;

/**
 * .env 의 JWT_ACCESS_SECRET 을 jose 가 쓰는 바이트 배열로 돌려줘요.
 * 비어 있거나 너무 짧으면 에러를 던져요.
 */
export function getAccessTokenSecret(source: NodeJS.ProcessEnv = process.env): Uint8Array {
  const secret = source.JWT_ACCESS_SECRET?.trim() ?? '';

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_ACCESS_SECRET 을 .env 에 ${MIN_SECRET_LENGTH}자 이상으로 적어 주세요.`);
  }

  return new TextEncoder().encode(secret);
}
