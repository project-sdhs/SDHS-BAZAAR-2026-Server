# SDHS-BAZAAR-2026-Server

서울디지텍고등학교 2026 디지텍 바자회 · 크레딧 결제 시스템 API 서버 (Node.js + TypeScript + Express)

> 지금은 **헬스 체크(`GET /health`)** 와 MySQL 사용 예시인 **앱 버전 API(`/app-versions`)** 가 있어요.
> DB는 **MySQL 8**이고, ORM 없이 [`mysql2`](https://sidorares.github.io/node-mysql2/docs) 로 SQL을 직접 써요. Docker · 배포 설정은 아직 없어요.

**API 명세:** [디지텍 바자회 API 명세](https://claude.ai/artifact/Qk2heDHJUYqTrHR9WLBoYR) — 새 API는 이 문서를 기준으로 만들어요.

## 시작하기

준비물: **Node.js 22.13 이상** (22 LTS 권장 · CI도 최신 22.x), npm, **MySQL 8**

- ESLint · vitest가 22.13 이상을 요구해요. 24 · 26도 되지만 **23 · 25는 지원하지 않아요.** (`package.json`의 `engines`)
- nvm을 쓴다면 `nvm install && nvm use` 로 `.nvmrc`(22)에 맞춰요.

```bash
npm install            # 처음 한 번 (CI처럼 lock 파일 그대로 설치하려면 npm ci)
cp .env.example .env   # DB_* 값을 내 MySQL에 맞게 채워요 (아래 'MySQL 준비')
npm run dev            # DB 연결을 확인한 뒤 http://localhost:3000/health
```

| 명령                | 하는 일                                           |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | 개발 서버 실행 (파일을 저장하면 자동 재시작)      |
| `npm test`          | 테스트 (vitest + supertest), `npm run test:watch` |
| `npm run lint`      | ESLint 검사                                       |
| `npm run typecheck` | 타입 검사                                         |
| `npm run format`    | Prettier로 코드 정리 (`format:check`는 검사만)    |
| `npm run build`     | TypeScript → `dist/` 빌드                         |
| `npm start`         | 빌드한 `dist/server.js` 실행                      |

PR 올리기 전에 CI와 같은 검사를 한 번에:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

### MySQL 준비

서버는 켜질 때 DB에 연결해 보고, 연결이 안 되면 켜지지 않아요.

1. 내 컴퓨터의 MySQL에 DB와 계정을 만들어요. (`mysql -u root -p` 로 들어가서)

   ```sql
   CREATE DATABASE sdhs_bazaar CHARACTER SET utf8mb4;
   CREATE USER 'bazaar'@'localhost' IDENTIFIED BY '내가 정한 비밀번호';
   GRANT ALL PRIVILEGES ON sdhs_bazaar.* TO 'bazaar'@'localhost';
   ```

2. 테이블을 만들어요: `mysql -u bazaar -p sdhs_bazaar < db/app_versions.sql`
3. `.env` 의 `DB_USER` · `DB_PASSWORD` · `DB_NAME` 을 위에서 정한 값으로 채워요.

팀 서버 DB는 밖에서 바로 열리지 않아요(127.0.0.1 전용). 접속 정보는 팀장에게 받아서, SSH 터널을 연 뒤 `.env` 의 `DB_PORT` 에 터널 포트를 적어요.

## API

| 요청                       | 응답                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /health`              | `200` `{ "status": "ok", "uptime": 12, "timestamp": "2026-10-14T09:00:00.000Z" }`             |
| `GET /app-versions`        | `200` `{ "items": [앱 버전, …] }` (최근 순)                                                   |
| `GET /app-versions/latest` | `200` 지금 앱 버전 · 없으면 `404`                                                             |
| `GET /app-versions/:id`    | `200` 앱 버전 · 없으면 `404`                                                                  |
| `POST /app-versions`       | 본문 `{ "version": "1.2.0", "forceUpdate": true }` → `201` 앱 버전 · 같은 버전이 있으면 `409` |
| `PATCH /app-versions/:id`  | 본문 `{ "forceUpdate": false }` 처럼 바꿀 값만 → `200` 앱 버전                                |
| 없는 경로                  | `404` `{ "code": "NOT_FOUND", "message": "..." }`                                             |
| 잘못된 본문                | `400` `INVALID_JSON` · `413` `PAYLOAD_TOO_LARGE` · `415` `UNSUPPORTED_MEDIA_TYPE`             |

앱 버전 모양: `{ "id": 1, "version": "1.2.0", "forceUpdate": true, "createdAt": "…", "updatedAt": "…" }`. 본문이 틀리면 `400` `VALIDATION_FAILED`.

에러 응답은 모두 `{ code, message }` 모양이에요. 코드에서 에러를 내려면 `throw new HttpError(404, 'BOOTH_NOT_FOUND', '부스를 찾을 수 없습니다.')`.

## 폴더 구조

요청 흐름: `routes` → `controllers` → `services` → `repositories`

```
src/
  app.ts            # createApp(): 미들웨어 · 라우터 · 404 · 에러 핸들러 조립 (테스트에서도 사용)
  server.ts         # 환경 변수를 읽고 서버 실행 (app.listen)
  config/           # 환경 변수 검사 (env.ts, zod) · MySQL 연결 풀 (db.ts)
  routes/           # URL ↔ 컨트롤러 연결 (index.ts에서 모든 라우터를 모아요)
  controllers/      # 요청을 받아 응답을 보내요 (health.controller.ts)
  services/         # 비즈니스 로직 (예: credit.service.ts)
  repositories/     # DB 읽기/쓰기 · SQL은 여기에만 (app-version.repository.ts)
  models/           # 데이터 타입 · zod 스키마
  middlewares/      # 공통 미들웨어 (not-found.ts, error-handler.ts)
  utils/            # 작은 도움 코드 (http-error.ts)
tests/              # 테스트 (*.test.ts, supertest로 createApp() 호출)
db/                 # 테이블을 만드는 SQL (app_versions.sql)
```

## MySQL 쓰는 법 (앱 버전 API 예시)

요청 하나가 지나가는 길: `routes/app-version.routes.ts` → `controllers/app-version.controller.ts`(입력 검사) → `services/app-version.service.ts`(규칙: 없으면 404, 같은 버전이면 409) → `repositories/app-version.repository.ts`(SQL)

```ts
import { getPool } from '../config/db.js';

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
