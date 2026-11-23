import { createHash, randomBytes } from 'node:crypto';

import { readyRedis } from './redis.js';

/**
 * 백오피스 쿠키 세션 저장소 (SRV-06 · SRV-33). ERD "DB 밖에 두는 것"
 *
 * - 세션 id(sid)는 쿠키로만 주고, Redis 키에는 sid 의 SHA-256 해시만 써요. (Redis가 새어도 쿠키를 만들 수 없게)
 * - 값: 관리자 id(admin_accounts.id) · CSRF 토큰 · 만든 시각. 로그인부터 12시간 뒤 만료돼요.
 * - 관리자별 세션 목록(Set)도 둬서, 관리자 삭제 · 반장 계정 사용 중지 때 그 관리자의 세션을 한 번에 지워요.
 * 앱(학생 · 방문객)은 Access JWT + refresh_tokens 테이블이라 이 세션을 쓰지 않아요.
 */

const SESSION_PREFIX = 'bazaar:admin-session:';
const ADMIN_SESSIONS_PREFIX = 'bazaar:admin-sessions:';

export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface AdminSession {
  adminAccountId: number;
  csrfToken: string;
  createdAt: string;
}

function checkAdminAccountId(adminAccountId: number): void {
  if (!Number.isSafeInteger(adminAccountId) || adminAccountId <= 0) {
    throw new Error('관리자 ID는 양의 정수여야 합니다.');
  }
}

function hashSessionId(sessionId: string): string {
  if (!sessionId.trim()) {
    throw new Error('세션 ID가 비어 있습니다.');
  }

  return createHash('sha256').update(sessionId).digest('hex');
}

function sessionKey(sessionHash: string): string {
  return `${SESSION_PREFIX}${sessionHash}`;
}

function adminSessionsKey(adminAccountId: number): string {
  return `${ADMIN_SESSIONS_PREFIX}${adminAccountId}`;
}

/** 예측할 수 없는 쿠키용 무작위 값 (32바이트 → base64url 43자) */
function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 로그인 성공 뒤: 새 세션을 만들고 sid(쿠키 값)와 세션 내용을 돌려줘요. */
export async function createAdminSession(
  adminAccountId: number,
): Promise<{ sessionId: string; session: AdminSession }> {
  checkAdminAccountId(adminAccountId);

  const sessionId = randomToken();
  const sessionHash = hashSessionId(sessionId);
  const session: AdminSession = {
    adminAccountId,
    csrfToken: randomToken(),
    createdAt: new Date().toISOString(),
  };

  // 세션 값 · 관리자별 목록을 한 번에 써요. 목록은 가장 늦게 만든 세션만큼 살아 있어요.
  await readyRedis()
    .multi()
    .set(sessionKey(sessionHash), JSON.stringify(session), { EX: ADMIN_SESSION_TTL_SECONDS })
    .sAdd(adminSessionsKey(adminAccountId), sessionHash)
    .expire(adminSessionsKey(adminAccountId), ADMIN_SESSION_TTL_SECONDS)
    .exec();

  return { sessionId, session };
}

/** 요청마다: 쿠키의 sid 로 세션을 찾아요. 없거나 만료됐으면 null */
export async function getAdminSession(sessionId: string): Promise<AdminSession | null> {
  const value = await readyRedis().get(sessionKey(hashSessionId(sessionId)));

  if (value === null) {
    return null;
  }

  return JSON.parse(value) as AdminSession;
}

/** 로그아웃: 이 세션 하나를 지워요. 지웠으면 true */
export async function deleteAdminSession(sessionId: string): Promise<boolean> {
  const sessionHash = hashSessionId(sessionId);
  const session = await getAdminSession(sessionId);

  if (!session) {
    return false;
  }

  const [deleted] = await readyRedis()
    .multi()
    .del(sessionKey(sessionHash))
    .sRem(adminSessionsKey(session.adminAccountId), sessionHash)
    .exec();

  return Number(deleted) > 0;
}

/** 관리자 삭제 · 반장 계정 사용 중지: 그 관리자의 세션을 모두 지워요. 지운 세션 수를 돌려줘요. */
export async function deleteAllAdminSessions(adminAccountId: number): Promise<number> {
  checkAdminAccountId(adminAccountId);

  const redis = readyRedis();
  const listKey = adminSessionsKey(adminAccountId);
  const sessionHashes = await redis.sMembers(listKey);

  if (sessionHashes.length === 0) {
    await redis.del(listKey);
    return 0;
  }

  const [deleted] = await redis.multi().del(sessionHashes.map(sessionKey)).del(listKey).exec();

  return Number(deleted);
}
