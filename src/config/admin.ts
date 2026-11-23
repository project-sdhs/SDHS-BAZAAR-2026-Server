/**
 * 백오피스(관리자 웹) 설정.
 * env.ts 의 loadEnv() 는 DB 값이 꼭 있어야 해서, DB 없이 도는 테스트에서도 쓸 수 있게 따로 읽어요. (config/auth.ts 와 같은 방식)
 */

/**
 * .env 의 ADMIN_WEB_ORIGINS(쉼표로 구분)를 Origin 목록으로 돌려줘요.
 * 백오피스 화면이 열리는 주소만 적어요. 예: http://localhost:5173,https://admin.example.com
 * 비어 있거나 주소 모양이 아니면 에러를 던져요. (server.ts 에서 서버를 켤 때 한 번 확인)
 */
export function getAdminWebOrigins(source: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  const values = (source.ADMIN_WEB_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');

  if (values.length === 0) {
    throw new Error(
      'ADMIN_WEB_ORIGINS 를 .env 에 적어 주세요. (예: ADMIN_WEB_ORIGINS=http://localhost:5173)',
    );
  }

  const origins = values.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`ADMIN_WEB_ORIGINS 의 '${value}' 가 주소 모양이 아니에요.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`ADMIN_WEB_ORIGINS 의 '${value}' 는 http:// 또는 https:// 로 시작해야 해요.`);
    }
    return url.origin;
  });

  return new Set(origins);
}