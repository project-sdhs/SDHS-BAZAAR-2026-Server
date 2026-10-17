# SDHS-BAZAAR-2026-Server

서울디지텍고등학교 2026 디지텍 바자회 · 크레딧 결제 시스템 API 서버 (Node.js + TypeScript + Express)

> 지금은 **헬스 체크(`GET /health`)** 와 MySQL 사용 예시인 **앱 버전 API(`/app-versions`)** 가 있어요.
> DB는 **MySQL 8**이고, ORM 없이 [`mysql2`](https://sidorares.github.io/node-mysql2/docs) 로 SQL을 직접 써요. 테이블은 `migrations/` 의 SQL 파일로 만들어요. Docker · 배포 설정은 아직 없어요.

**API 명세:** [디지텍 바자회 API 명세](https://claude.ai/artifact/Qk2heDHJUYqTrHR9WLBoYR) — 새 API는 이 문서를 기준으로 만들어요.

## 시작하기

준비물: **Node.js 22.13 이상** (22 LTS 권장 · CI도 최신 22.x), npm, **MySQL 8**

- ESLint · vitest가 22.13 이상을 요구해요. 24 · 26도 되지만 **23 · 25는 지원하지 않아요.** (`package.json`의 `engines`)
- nvm을 쓴다면 `nvm install && nvm use` 로 `.nvmrc`(22)에 맞춰요.

```bash
npm install            # 처음 한 번 (CI처럼 lock 파일 그대로 설치하려면 npm ci)
cp .env.example .env   # DB_* 값을 내 MySQL에 맞게 채워요 (아래 'MySQL 준비')
npm run db:migrate     # 테이블 만들기 (migrations/ 중 아직 안 한 것만)
npm run dev            # DB 연결을 확인한 뒤 http://localhost:3000/health
```

| 명령                 | 하는 일                                           |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | 개발 서버 실행 (파일을 저장하면 자동 재시작)      |
| `npm test`           | 테스트 (vitest + supertest), `npm run test:watch` |
| `npm run test:db`    | 실제 MySQL(테스트 DB)에 붙는 테스트 (`tests/db/`) |
| `npm run db:migrate` | `migrations/` 의 SQL 중 아직 안 한 것을 실행      |
| `npm run lint`       | ESLint 검사                                       |
| `npm run typecheck`  | 타입 검사                                         |
| `npm run format`     | Prettier로 코드 정리 (`format:check`는 검사만)    |
| `npm run build`      | TypeScript → `dist/` 빌드                         |
| `npm start`          | 빌드한 `dist/server.js` 실행                      |

PR 올리기 전에 CI와 같은 검사를 한 번에:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

DB 쪽(SQL · 마이그레이션 · 저장소)을 바꿨다면 `npm run test:db` 도 돌려요. CI는 MySQL 8.0을 띄워서 마이그레이션 → DB 테스트까지 돌려요.

### MySQL 준비

서버는 켜질 때 DB에 연결해 보고, 연결이 안 되면 켜지지 않아요.

1. 내 컴퓨터의 MySQL(8.0 이상)에 개발용 DB · 테스트용 DB · 계정을 만들어요. (`mysql -u root -p` 로 들어가서)

   ```sql
   CREATE DATABASE sdhs_bazaar CHARACTER SET utf8mb4;
   CREATE DATABASE sdhs_bazaar_test CHARACTER SET utf8mb4;
   CREATE USER 'bazaar'@'localhost' IDENTIFIED BY '내가 정한 비밀번호';
   GRANT ALL PRIVILEGES ON sdhs_bazaar.* TO 'bazaar'@'localhost';
   GRANT ALL PRIVILEGES ON sdhs_bazaar_test.* TO 'bazaar'@'localhost';
   ```

2. `.env` 의 `DB_USER` · `DB_PASSWORD` · `DB_NAME` 을 위에서 정한 값으로 채워요.
3. `npm run db:migrate` 로 테이블을 만들어요.
4. (DB 테스트를 돌릴 때) `cp .env.test.example .env.test` → `npm run test:db`. 테스트는 `.env.test` 의 `sdhs_bazaar_test` 를 써요.

팀 서버 DB는 밖에서 바로 열리지 않아요(127.0.0.1 전용). 접속 정보는 팀장에게 받아서, SSH 터널을 연 뒤 `.env` 의 `DB_PORT` 에 터널 포트를 적어요.

## API

| 요청                       | 응답                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /health`              | `200` `{ "status": "ok", "db": "ok", "time": "2026-10-17T09:00:00.000Z" }` · DB 실패면 `503`  |
| `GET /app-versions`        | `200` `{ "items": [앱 버전, …] }` (최근 순)                                                   |
| `GET /app-versions/latest` | `200` 지금 앱 버전 · 없으면 `404`                                                             |
| `GET /app-versions/:id`    | `200` 앱 버전 · 없으면 `404`                                                                  |
| `POST /app-versions`       | 본문 `{ "version": "1.2.0", "forceUpdate": true }` → `201` 앱 버전 · 같은 버전이 있으면 `409` |
| `PATCH /app-versions/:id`  | 본문 `{ "forceUpdate": false }` 처럼 바꿀 값만 → `200` 앱 버전                                |
| `GET /uploads/<경로>`      | 이미지 파일 그대로 (`jpg` · `jpeg` · `png` · `webp` · `gif`) · 없으면 `404`                   |
| 없는 경로                  | `404` `{ "code": "NOT_FOUND", "message": "..." }`                                             |
| 잘못된 본문                | `400` `INVALID_JSON` · `413` `PAYLOAD_TOO_LARGE` · `415` `UNSUPPORTED_MEDIA_TYPE`             |

앱 버전 모양: `{ "id": 1, "version": "1.2.0", "forceUpdate": true, "createdAt": "…", "updatedAt": "…" }`. 본문이 틀리면 `400` `VALIDATION_FAILED`.

### 이미지 정적 서빙

`UPLOAD_DIR`(기본 `uploads/`) 안의 이미지를 경로 그대로 내려줘요. 예: `uploads/menus/12.webp` → `GET /uploads/menus/12.webp` (테스트 서버: `https://api.wkrdjqtlf.work/bazaar/uploads/menus/12.webp`)

- 이미지(`jpg` · `jpeg` · `png` · `webp` · `gif`)만 내려줘요. SVG · 다른 파일 · 폴더 목록 · 점(.) 파일은 `404`.
- 하루 동안 캐시돼요. 사진을 바꿀 때는 같은 이름에 덮어쓰지 말고 **새 이름으로 저장**하고 DB의 경로를 바꿔요.
- 사진을 받아서 저장하는 API(부스 · 메뉴 사진 올리기)는 각 기능 티켓에서 만들어요. 저장할 때 `UPLOAD_DIR` 아래에 두면 바로 이 주소로 보여요.

에러 응답은 모두 `{ code, message }` 모양이에요. 코드에서 에러를 내려면 `throw new HttpError(404, 'BOOTH_NOT_FOUND', '부스를 찾을 수 없습니다.')`.

## 폴더 구조

요청 흐름: `routes` → `controllers` → `services` → `repositories`

```
src/
  app.ts            # createApp(): 미들웨어 · 라우터 · 404 · 에러 핸들러 조립 (테스트에서도 사용)
  server.ts         # 환경 변수를 읽고 DB 연결을 확인한 뒤 서버 실행 (app.listen)
  migrate.ts        # npm run db:migrate 가 실행하는 파일
  config/           # 환경 변수 검사 (env.ts, zod)
  db/               # MySQL 연결 풀 (pool.ts) · 트랜잭션 (transaction.ts) · 마이그레이션 도구 (migrator.ts)
  routes/           # URL ↔ 컨트롤러 연결 (index.ts에서 모든 라우터를 모아요)
  controllers/      # 요청을 받아 응답을 보내요 (health.controller.ts)
  services/         # 비즈니스 로직 (예: credit.service.ts)
  repositories/     # DB 읽기/쓰기 · SQL은 여기에만 (app-version.repository.ts)
  models/           # 데이터 타입 · zod 스키마
  middlewares/      # 공통 미들웨어 (not-found.ts, error-handler.ts, uploads.ts)
  utils/            # 작은 도움 코드 (http-error.ts)
tests/              # 테스트 (*.test.ts, supertest로 createApp() 호출) · tests/db/ 는 실제 DB 테스트
migrations/         # 테이블을 만들고 바꾸는 SQL (001_create_app_versions.sql …)
uploads/            # 올린 이미지 (UPLOAD_DIR 기본값, git에 안 올라가요)
```

## MySQL 쓰는 법 (앱 버전 API 예시)

요청 하나가 지나가는 길: `routes/app-version.routes.ts` → `controllers/app-version.controller.ts`(입력 검사) → `services/app-version.service.ts`(규칙: 없으면 404, 같은 버전이면 409) → `repositories/app-version.repository.ts`(SQL)

```ts
import { getPool } from '../db/pool.js';

// 읽기: 결과는 [rows, fields]. rows 는 한 줄이 객체 하나인 배열이에요.
const [rows] = await getPool().execute<AppVersionRow[]>(
  'SELECT id, version, force_update FROM app_versions WHERE id = ?',
  [id],
);

// 쓰기: 결과의 insertId(새 id) · affectedRows(바뀐 줄 수)를 볼 수 있어요.
const [result] = await getPool().execute<ResultSetHeader>(
  'INSERT INTO app_versions (version, force_update) VALUES (?, ?)',
  [version, forceUpdate],
);
```

- **값은 꼭 `?` 자리에** 넣어요. `` `... WHERE id = ${id}` `` 처럼 문자열로 이어 붙이면 SQL 인젝션이 생겨요.
- `getPool()` 은 연결 풀이에요. 연결을 직접 열고 닫지 않아도 돼요. 새 연결마다 UTC 시각 · READ COMMITTED 설정을 먼저 실행해요.
- DB 컬럼은 `snake_case`, API는 `camelCase` 예요. 저장소의 `toAppVersion()` 처럼 한곳에서 바꿔요.
- `BOOLEAN` 은 MySQL 안에서 `TINYINT(1)` 이라 `0` / `1` 로 와요. `=== 1` 로 `true` / `false` 로 바꿔요.
- `TIMESTAMP` 는 JS `Date` 로 와요. 응답에는 `toISOString()` 으로 보내요.
- 테스트(`tests/app-version.test.ts`)는 DB 없이 돌도록 저장소를 메모리 가짜로 바꿔요(`vi.mock`).

### 테이블 만들기 · 바꾸기 (마이그레이션)

1. `migrations/` 에 다음 번호로 SQL 파일을 만들어요. 이름 규칙: 숫자 3자리 + 소문자 설명 (예: `002_create_classes.sql`)
2. `npm run db:migrate` → 아직 실행하지 않은 파일만 번호 순서대로 실행하고, `schema_migrations` 표에 기록해요.
3. SQL 파일도 PR에 같이 올려요. 다른 사람은 받은 뒤 `npm run db:migrate` 한 번이면 같은 테이블이 생겨요.

- **이미 실행한 파일은 고치지 않아요.** 바꿀 게 생기면 `ALTER TABLE` 을 담은 새 파일을 추가해요. (고치면 도구가 멈춰요)
- 새 파일에는 `IF NOT EXISTS` 를 붙이지 않아요. 이미 있으면 에러가 나야 실수를 알 수 있어요. (001만 예외: 팀 서버에 손으로 먼저 만들어 둔 표)
- MySQL은 `CREATE` · `ALTER` 를 되돌릴 수 없어요. 파일 중간에서 실패하면 앞 문장은 실행된 상태라, 손으로 정리한 뒤 파일을 고쳐 다시 실행해요.

### 트랜잭션 (여러 쿼리를 한 번에)

돈이 움직이는 일처럼 "전부 되거나 전부 안 되거나" 해야 하면 `withTransaction` 을 써요. (서버 규칙 1)

```ts
import { withTransaction } from '../db/transaction.js';

const paymentId = await withTransaction(async (connection) => {
  await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
  const [result] = await connection.execute<ResultSetHeader>('INSERT INTO payments …', [/* … */]);
  return result.insertId;
});
```

- 끝까지 성공하면 COMMIT, 에러가 나면 ROLLBACK 하고 에러를 다시 던져요.
- 교착(1213) · 잠금 대기 초과(1205)는 처음부터 다시 실행해요(최대 3번). 그래서 `fn` 은 여러 번 실행될 수 있어요.
- 안에서는 꼭 넘겨받은 `connection` 으로 쿼리해요. `getPool()` 로 하면 트랜잭션 밖에서 실행돼요.
- 외부 호출(Google · Redis · 파일 · 알림)은 트랜잭션 밖, 커밋이 끝난 뒤에 해요.

새 API 추가 순서(예: 부스 목록): `controllers/booth.controller.ts` → `routes/booth.routes.ts` → `routes/index.ts`에 `router.use('/booths', boothRouter)` 한 줄 → `tests/booth.test.ts`.

알아 두기

- import 경로 끝에는 `.js`를 붙여요 (예: `import { createApp } from './app.js'`). ESM 규칙이라 `.ts` 파일이어도 `.js`로 씁니다.
- 환경 변수를 추가하면 `src/config/env.ts`와 `.env.example`을 같이 고쳐요. `.env`는 git에 올리지 않아요.
- `package.json`의 `overrides.vite`는 npm 10에서 vitest 설치가 실패하는 문제를 피하려고 넣은 설정이에요. 지우지 마세요.

## 브랜치 · PR 규칙

- `main`에서 브랜치를 만들어요: `feat/…` (기능), `fix/…` (버그), `chore/…` (설정 · 기타)
- `main`에 직접 push 하지 않아요. PR → 리뷰 → **Squash merge**
- CI(format · lint · typecheck · test · build)가 통과해야 머지해요.
- 커밋 메시지는 Conventional Commits: `feat: 부스 목록 API 추가`, `fix: …`, `chore: …`
