# 대륜톡 (가칭, 옛 이름 라잇나우)

의뢰인·변호사·직원이 함께 쓰는 사내 메신저 겸 업무 앱입니다. 하나의 코드로 웹(PC·폰 브라우저, 앱 설치 가능)과 안드로이드 앱이 나옵니다.
이 문서는 개발팀 인수인계용입니다. 비밀 키 값은 이 저장소에 없고, 이름만 적어 두었습니다.

- 운영 웹: https://seoseungdeock-cloud.github.io/-/ (GitHub Pages, `gh-pages` 가지)
- 서버: Supabase 프로젝트 `jzhzroexavltxrrjcbfa` (Pro, 서울 리전)
- 기본 가지: `main`

## 무엇이 들어 있나

| 기능 | 주요 위치 |
|---|---|
| 로그인·백오피스(계정 발급, 역할, 배당 안내, 의뢰인 전화번호) | `src/app/login.tsx`, `src/app/backoffice.tsx`, `supabase/functions/admin-accounts` |
| 메신저(1:1·단체·사건방·상담방·나와의 메시지, 파일·사진·영상, 회수) | `src/app/(tabs)`, `src/app/room`, `src/ui/chat.tsx`, `src/core/messenger.ts` |
| 사건 자료·기일·불변기간 알림, 대륜탑 엑셀 올리기 | `src/core/deadlines.ts`, `src/core/hearings.ts`, `src/core/daeryuntop.ts` |
| 배당/재배당 안내 카드, 배당인사 확인·미확인 경고 | `src/core/assign.ts`, `src/ui/assign-panel.tsx` |
| 익명 게시판(9개 탭, 쪽지, 신고, 관리자 권한) | `src/app/board`, `src/core/board.ts`, `supabase/functions/board-upload` |
| `@AI` (방 안 AI, PDF·HWP·HWPX 읽기, `@AI 띠지`, `@AI 오타`) | `src/core/room-ai.ts`, `src/core/hwp-text.ts`, `supabase/functions/axiom` |
| AXIOM 경영관리(위원회, 작업지시, 회의 정리) — 업무 탭, 어드민 전용 | `src/core/axiom`, `src/app/axiom`, `supabase/functions/axiom` |
| 푸시(폰 Expo 푸시, PC 웹 푸시), 08:30 요약 | `supabase/functions/push-send`, `src/core/push.ts`, `src/core/web-push.ts` |
| 변호사 찾기 지도, 대륜 아너스 멤버십, 캘린더 | `src/app/(tabs)`, `src/core/offices.ts`, `src/core/membership.ts`, `src/core/calendar.ts` |

## 폴더

```
src/app/              화면 (Expo Router: 파일 하나가 화면 하나)
src/core/             규칙과 상태. 화면 없이 테스트됨 (store.ts = 앱 상태, remote.ts = 서버 연결)
src/core/__tests__/   단위 테스트 (jest)
src/ui/               공통 부품, 디자인 토큰(theme.ts), 시트·채팅 부품
supabase/migrations/  DB 구조·보안 규칙(RLS)·서버 함수(RPC)·예약 작업. 날짜순으로 적용
supabase/functions/   Edge Functions (Deno)
supabase/tests/       로컬 Postgres로 마이그레이션·보안 규칙 시험
scripts/              웹 배포, AXIOM 함수 배포, 첫 관리자 만들기, 지도·사무소 데이터
.github/workflows/    안드로이드 APK 빌드
```

## 로컬 실행

Node 22 기준입니다.

```bash
npm ci
cp .env.example .env      # 값을 비우면 서버 없이 예시 데이터로 동작합니다
npx expo start            # w 키로 웹, 또는 휴대폰 Expo Go
npm test                  # 단위 테스트 (jest)
npx tsc --noEmit          # 타입 검사
bash supabase/tests/run.sh   # DB 마이그레이션·보안 규칙 시험 (로컬 Postgres 16 필요)
```

예시 데이터 모드(서버 없음) 계정: `admin / admin1234`, `subadmin / subadmin1234`, `staff / staff1234`, `lawyer / lawyer1234`, `client / client1234`.
운영 서버 계정은 앱의 백오피스에서 관리합니다.

## 설정값 (이름만, 값은 저장소에 넣지 않음)

**앱에 들어가는 공개 값** (`.env`, 빌드 때 앱에 포함됨 — 공개되어도 되는 값)

| 이름 | 내용 |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 주소 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 (보안은 DB의 RLS가 담당) |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | PC 웹 푸시 공개 키 |

**Supabase → Edge Functions → Secrets** (서버에만 있음, 절대 앱·저장소·채팅에 넣지 않음)

| 이름 | 쓰는 곳 |
|---|---|
| `OPENAI_API_KEY` | `@AI`, AXIOM. **지금은 개인 시험 키 → 대륜 명의 키로 교체 필요** |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | AXIOM 다른 AI 선택 시 (선택) |
| `AXIOM_LLM`, `AXIOM_LLM_TIMEOUT_MS` | AXIOM이 쓸 AI 종류·대기 시간 (선택) |
| `PUSH_CRON_SECRET` | 예약 작업 → `push-send` 호출 확인값 |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | PC 웹 푸시 보내기 |
| `DAERYUNTOP_WEBHOOK_SECRET` | 대륜탑 기일 연동 (아직 미사용) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase가 자동으로 넣어 줌 |

**DB Vault** (`vault.secrets`): `push_function_url`, `push_cron_secret` — 1분마다 도는 `pg_cron` 작업 `push-send`가 이 값으로 함수를 부릅니다.

**배포하는 사람의 환경변수** (개인 것, 저장소에 넣지 않음): `SUPABASE_ACCESS_TOKEN` (Supabase 개인 접근 토큰).
첫 관리자 만들 때만: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRST_ADMIN_ID`, `FIRST_ADMIN_PASSWORD`, `FIRST_ADMIN_NAME`.

## 서버(Supabase) 배포

1. **DB**: `supabase/migrations/*.sql`을 날짜순으로 적용 (`supabase db push` 또는 SQL 편집기). 운영 DB에는 모두 적용되어 있습니다.
2. **Edge Functions** (운영에 올라간 것과 JWT 확인 설정)

   | 함수 | verify_jwt | 올리는 법 |
   |---|---|---|
   | `axiom` | false (함수 안에서 직접 확인) | `bash scripts/deploy-axiom.sh --deploy` — `src/core`를 함께 묶어야 해서 이 스크립트로만 |
   | `push-send` | false (`x-push-secret` 확인) | `supabase functions deploy push-send --no-verify-jwt` |
   | `admin-accounts` | true | `supabase functions deploy admin-accounts` |
   | `board-upload` | true | `supabase functions deploy board-upload` |
   | `daeryuntop-hearing` | — | 아직 배포 안 함 (대륜탑 쪽 보내기 기능이 준비되면) |

3. **첫 관리자** (새 프로젝트일 때 한 번): `node scripts/supabase-first-admin.mjs`

## 웹 배포 (GitHub Pages)

```bash
set -a && . ./.env && set +a
bash scripts/build-web.sh --deploy    # 빌드 후 gh-pages 가지에 올림
```

앱 설치(PWA) 정보와 서비스 워커를 붙여 줍니다. 배포 후 사용자는 Ctrl+F5로 새로고침해야 새 버전이 보입니다.
주의: 무료 GitHub에서 저장소를 비공개로 바꾸면 Pages가 멈춥니다 (GitHub Pro 또는 다른 호스팅 필요).

## 안드로이드 APK

GitHub Actions의 `android-apk` 작업이 만듭니다. Actions 화면에서 직접 실행(workflow_dispatch)하거나, 커밋 메시지에 `[apk]`를 넣으면 돕니다.
결과는 실행 화면의 `rightnow-apk` 파일(30일 보관)입니다. 지금은 임시 서명 키라서, 정식 키로 바꾸면 폰에서 한 번 지우고 다시 설치해야 합니다.
폰 푸시는 Expo 계정과 Firebase 프로젝트, 아이폰은 Apple 개발자 계정이 추가로 필요합니다.

## 꼭 지킬 것

- **운영 중인 대륜탑은 건드리지 않습니다.** 연동은 대륜탑이 이 앱으로 기일을 보내는 방식(`daeryuntop-hearing`)이고, 앱이 대륜탑 안을 읽지 않습니다.
- 비밀 키(관리자 키, AI 키)는 Supabase Secrets에만. 저장소·채팅·로그에 넣지 않습니다.
- 배당 안내(`messages.staff_only`)는 의뢰인에게 보이지 않아야 합니다 (RLS와 푸시 모두에서 제외).
- AI 규칙: 변호사가 없는 방에서는 일반 정보만, 사건방·상담방에서는 `@AI` 차단(`@AI 띠지`만 예외, AI를 쓰지 않음).

## 실제 의뢰인 자료를 넣기 전에 할 일

- 개인정보 처리위탁·국외이전 고지 (Supabase, 해외 AI, 휴대폰 연락처 저장 포함)
- 관리자 2단계 로그인, 접속 기록 1년 이상 보관
- AI 키를 대륜 명의로 교체
- 정식 안드로이드 서명 키, 저장소 비공개 전환 검토
