# SDHS-BAZAAR-2026-Server

서울디지텍고등학교 2026 디지텍 바자회 · 크레딧 결제 시스템 API 서버 (Node.js + TypeScript + Express)

> 지금은 **헬스 체크(`GET /health`)만** 있어요.
> 서버를 올릴 곳(호스팅)과 DB를 아직 정하지 않아서 DB 드라이버 · ORM · Docker · 배포 설정은 일부러 넣지 않았습니다.

**API 명세:** [디지텍 바자회 API 명세](https://claude.ai/artifact/Qk2heDHJUYqTrHR9WLBoYR) — 새 API는 이 문서를 기준으로 만들어요.

## 시작하기

준비물: **Node.js 22.13 이상** (22 LTS 권장 · CI도 최신 22.x), npm

- ESLint · vitest가 22.13 이상을 요구해요. 24 · 26도 되지만 **23 · 25는 지원하지 않아요.** (`package.json`의 `engines`)
- nvm을 쓴다면 `nvm install && nvm use` 로 `.nvmrc`(22)에 맞춰요.

```bash
npm install            # 처음 한 번 (CI처럼 lock 파일 그대로 설치하려면 npm ci)
cp .env.example .env   # 선택: 포트 등을 바꾸고 싶을 때
npm run dev            # http://localhost:3000/health
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

## API

| 요청          | 응답                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `GET /health` | `200` `{ "status": "ok", "uptime": 12, "timestamp": "2026-10-14T09:00:00.000Z" }` |
| 없는 경로     | `404` `{ "code": "NOT_FOUND", "message": "..." }`                                 |

에러 응답은 모두 `{ code, message }` 모양이에요. 코드에서 에러를 내려면 `throw new HttpError(404, 'BOOTH_NOT_FOUND', '부스를 찾을 수 없습니다.')`.

## 폴더 구조

요청 흐름: `routes` → `controllers` → `services` → `repositories`

```
src/
  app.ts            # createApp(): 미들웨어 · 라우터 · 404 · 에러 핸들러 조립 (테스트에서도 사용)
  server.ts         # 환경 변수를 읽고 서버 실행 (app.listen)
  config/           # 환경 변수 검사 (env.ts, zod)
  routes/           # URL ↔ 컨트롤러 연결 (index.ts에서 모든 라우터를 모아요)
  controllers/      # 요청을 받아 응답을 보내요 (health.controller.ts)
  services/         # 비즈니스 로직 (예: credit.service.ts)
  repositories/     # DB 읽기/쓰기 (DB가 정해지면)
  models/           # 데이터 타입 · zod 스키마
  middlewares/      # 공통 미들웨어 (not-found.ts, error-handler.ts)
  utils/            # 작은 도움 코드 (http-error.ts)
tests/              # 테스트 (*.test.ts, supertest로 createApp() 호출)
```

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
