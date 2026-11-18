# 스카이넷 (SKYNET) — 대륜 업무 메신저

2026-11-16 스카이넷으로 이름을 정했습니다. 코드 안의 `rightnow` 가 붙은 식별자(로그인 도메인 `rightnow.local`, 멤버십 값, 저장소 키, 의뢰인 표시 `대륜톡 의뢰인`)는 이전 운영 때 **이미 운영 DB 와 기기에 저장된 값이라 그대로 둡니다** — 바꾸면 기존 계정·설정이 끊깁니다. 이 식별자는 내부 키일 뿐 화면이나 문서에서 이전 이름을 쓰지 않습니다.

의뢰인·변호사·직원이 함께 쓰는 사내 메신저 겸 업무 앱입니다. 하나의 코드로 웹(PC·폰 브라우저), PC 앱(브라우저에서 설치하는 PWA), 안드로이드 앱이 나옵니다.

**화면 구성** (2026-11-17 개편 — 슬랙식 진한 남색 메뉴, 대화 중심) — 창 폭에 따라 자동으로 고르며 MY 탭 「화면 구성」에서 고정할 수 있습니다.
| 구성 | 언제 | 모습 |
|---|---|---|
| 데스크톱 | 창 폭 1024px 이상 | 왼쪽 240px 남색 메뉴(`src/ui/shell.tsx`, 현재 항목 표시가 미끄러져 따라감) + 흰 본문. 메신저는 「방 목록 340px | 대화」 2단(`src/ui/messenger-list.tsx`) |
| 태블릿 | 768~1023px | 왼쪽 64px 남색 아이콘 메뉴, 메신저는 1단 |
| 모바일 | 767px 이하, 폰 앱 | 아래 탭(`src/ui/tab-bar.tsx`, 미끄러지는 표시·튀는 아이콘). 대화 탭 위는 남색 띠(제목·주소록·오픈대화방·새 대화·검색). PC 에서 '모바일'을 고르면 504px 폰 틀을 가운데에 띄움 |

메뉴는 **대화 · 게시판 · 캘린더 · MY**(권한자는 업무)입니다. 사건 탭은 없고 사건 정보는 사건방 안(`src/ui/case-panel.tsx`)에서 봅니다.
대화 목록은 한 목록이며 칩(전체·안 읽음·1:1·그룹·의뢰인)으로 걸러 봅니다. 대화방은 같은 사람이 5분 안에 연달아 보낸 메시지를 한 묶음으로 보여 줍니다(첫 것에 이름·사진, 마지막 것에 시각).
움직임은 모두 `src/ui/motion.tsx`(react-native-reanimated)의 부품(Appear·Press·Pop·Slide·Fade)만 씁니다. 고르기 부품(칩·세그먼트)은 `src/ui/segments.tsx`.
이 문서는 개발팀 인수인계용입니다. 비밀 키 값은 이 저장소에 없고, 이름만 적어 두었습니다.

- 운영 웹: https://seoseungdeock-cloud.github.io/-/ (GitHub Pages, `gh-pages` 가지)
- 서버: **회사 AWS 계정(서울)에 직접 설치한 Supabase** — `https://skynet-api.skyzkorea.net` (EC2 `skynet-supabase`, 2026-11-16부터). 자세한 것은 아래 「서버(Supabase) 운영」.
  옛 Supabase 클라우드 프로젝트 `jzhzroexavltxrrjcbfa` 는 대륜톡 시절 데이터를 가지고 있으며, 옮기기 전까지는 그대로 둡니다.
- 기본 가지: `main`

## 로그인 (2026-11-16부터 대륜탑 사번)

구성원은 **대륜탑 사번·비밀번호**로 들어옵니다. 흐름은 이렇습니다.

1. 앱이 서버 함수 `daeryuntop-login` 에 사번·비밀번호를 보냅니다.
2. 함수가 대륜탑 인증 서버(AEGIS `api/users/loginProc`, SKYZAI 와 같은 호출)에 확인합니다.
3. 통과하면 그 사번의 Supabase 계정(`사번@rightnow.local`)을 찾거나 새로 만들고(비밀번호는 저장하지 않음), 이름·직위·지점·부서는
   SKYZAI 의 연결 창구(`/api/bridge/member`, 공유 비밀 `DAERYUNTOP_BRIDGE_KEY`)에서 받아 프로필에 채웁니다. 변호사 직위면 역할 `lawyer`, 아니면 `staff`.
   이미 있는 계정의 역할(`admin` 등)은 건드리지 않습니다.
4. 함수가 일회용 로그인 토큰을 돌려주고 앱이 `verifyOtp` 로 세션을 엽니다.

대륜탑에 없는 계정(의뢰인, 옛 발급 계정)은 함수가 `not_staff` 로 답하고 앱이 **종전의 비밀번호 로그인**으로 넘어갑니다. 그래서 백오피스의 계정 발급은 의뢰인용으로 계속 씁니다.

함수 설정값(서버의 `/opt/skynet/.env`): `DAERYUNTOP_BRIDGE_URL`(SKYZAI 주소), `DAERYUNTOP_BRIDGE_KEY`(SKYZAI 쪽 `SKYNET_BRIDGE_KEY` 와 같은 값). 둘이 없으면 이름만 AEGIS 응답으로 채우고 역할은 `staff` 가 됩니다.

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
| 캘린더, 사무소·담당 변호사 목록(백오피스·배당 안내용) | `src/app/(tabs)/calendar.tsx`, `src/core/calendar.ts`, `src/core/offices.ts` |
| SKYZAI(song_mu) 메신저 연결 — SKYZAI 의 메신저 화면이 이 서버의 방·글·파일을 그대로 쓴다 (2026-11-18) | `supabase/migrations/20261118000000_skyzai_messenger.sql`, `supabase/functions/skyzai-bridge` |

## 폴더

```
src/app/              화면 (Expo Router: 파일 하나가 화면 하나)
src/core/             규칙과 상태. 화면 없이 테스트됨 (store.ts = 앱 상태, remote.ts = 서버 연결)
src/core/__tests__/   단위 테스트 (jest)
src/ui/               공통 부품, 디자인 토큰(theme.ts), 시트·채팅 부품
supabase/migrations/  DB 구조·보안 규칙(RLS)·서버 함수(RPC)·예약 작업. 날짜순으로 적용
supabase/functions/   Edge Functions (Deno)
supabase/tests/       로컬 Postgres로 마이그레이션·보안 규칙 시험
scripts/              웹 배포, AXIOM 함수 배포, 첫 관리자 만들기, 사무소 데이터 변환
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

**서버 함수 비밀값** — 서버의 `/opt/skynet/.env` 에 있고 `docker-compose.skynet.yml` 이 함수 컨테이너에 넘깁니다 (절대 앱·저장소·채팅에 넣지 않음). 사본은 AWS Secrets Manager `skynet/supabase`.

| 이름 | 쓰는 곳 |
|---|---|
| `OPENAI_API_KEY` | `@AI`, AXIOM. **지금은 개인 시험 키 → 대륜 명의 키로 교체 필요** |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | AXIOM 다른 AI 선택 시 (선택) |
| `AXIOM_LLM`, `AXIOM_LLM_TIMEOUT_MS` | AXIOM이 쓸 AI 종류·대기 시간 (선택) |
| `PUSH_CRON_SECRET` | 예약 작업 → `push-send` 호출 확인값 |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | PC 웹 푸시 보내기 |
| `DAERYUNTOP_WEBHOOK_SECRET` | 대륜탑 기일 연동 (아직 미사용) |
| `DAERYUNTOP_DB_URL` | 대륜탑(ERP) DB 주소 `postgres://계정:비밀번호@호스트:5432/디비` — **읽기 전용 계정**으로 (`admin_user`, `common_code` SELECT 권한만). `daeryuntop-sync` 가 구성원 명단을 읽는 데 씀 |
| `DAERYUNTOP_SYNC_SECRET` | 예약 작업 → `daeryuntop-sync` 호출 확인값 (Vault `daeryuntop_sync_secret` 과 같은 값) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase가 자동으로 넣어 줌 |

**DB Vault** (`vault.secrets`): `push_function_url`, `push_cron_secret` — 1분마다 도는 `pg_cron` 작업 `push-send`가 이 값으로 함수를 부릅니다.
`daeryuntop_sync_url`(= `<SUPABASE_URL>/functions/v1/daeryuntop-sync`), `daeryuntop_sync_secret` — 매일 06:10(한국 시간) 도는 `daeryuntop-sync` 작업이 씁니다.

## 구성원 명단 — 대륜탑 기준 동기화 (2026-11-19)
주소록·조직도는 스카이넷 `profiles` 를 보여 주는데, 이 표는 **대륜탑 재직 명단을 기준으로 맞춥니다**. 서버 함수 `daeryuntop-sync` 가
대륜탑 DB 의 `admin_user`(승인·미삭제)와 `common_code`(직위·지점 이름)를 **SELECT 만** 해서:
- 대륜탑에 있는데 스카이넷에 없는 사번은 계정을 만들어 둡니다 (비밀번호 없음 — 로그인은 늘 대륜탑 인증). 그래서 로그인 전 사람도 주소록에 보입니다.
- 이름·직위·부서·지점·전화·이메일을 대륜탑 값으로 맞춥니다. 직위에 '변호사'가 들어가면 역할 `lawyer`, 아니면 `staff`. 어드민 역할은 건드리지 않습니다.
- 대륜탑에서 사라진(퇴사·삭제·미승인) 사번은 사용 중지(`active=false`)합니다. 다시 나타나면 다시 켭니다. 손으로 만든 계정(`profiles.source` 가 비어 있음 — 의뢰인·테스트)은 건드리지 않습니다.

돌리는 방법: 매일 06:10 자동(`pg_cron` `daeryuntop-sync`), 또는 백오피스 → 대륜탑 연동 → 「지금 동기화」(어드민). 결과(새 계정·갱신·중지 수)가 화면에 나오고 함수 로그에도 남습니다.

처음 켤 때는 한 번에 올리는 스크립트가 있습니다 (AWS 자격 증명 있는 터미널에서, MFA 는 묻는 대로):
```bash
DAERYUNTOP_DB_URL='postgresql://계정:비밀번호@호스트:5432/디비' bash scripts/deploy-daeryuntop-sync.sh
```
서버 `.env` 설정 → 마이그레이션 → Vault → 함수 배포 → 첫 동기화까지 하고 결과(재직 수·새 계정·갱신 수)를 보여 줍니다.
손으로 하려면: ① 서버 `/opt/skynet/.env` 에 `DAERYUNTOP_DB_URL`, `DAERYUNTOP_SYNC_SECRET` ② Vault 에 `daeryuntop_sync_url`, `daeryuntop_sync_secret` ③ 마이그레이션 `20261119000000_daeryuntop_sync.sql` ④ 함수 `daeryuntop-sync` 복사 후 `docker compose restart functions` ⑤ 백오피스 「지금 동기화」.
대륜탑 DB 쪽에서는 스카이넷 서버 IP(13.209.254.132)가 접속 허용 목록에 있어야 하고, 계정은 읽기 전용(`admin_user`, `common_code` SELECT)이면 가장 좋습니다. 2026-11-19 기준 대륜탑 재직 673명.

**배포하는 사람에게 필요한 것**: 회사 AWS 계정 권한 (서버는 SSH 키 없이 **SSM Session Manager** 로만 들어갑니다).
첫 관리자 만들 때만: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRST_ADMIN_ID`, `FIRST_ADMIN_PASSWORD`, `FIRST_ADMIN_NAME`.

## 서버(Supabase) 운영 — 회사 AWS 계정 안에 직접 설치

2026-11-16부터 Supabase 클라우드 대신 **공식 Supabase 셀프 호스팅(Docker Compose)** 을 회사 AWS 에 올려 씁니다. 앱 코드와 DB 설계는 그대로이고 주소만 다릅니다.

| 항목 | 값 |
|---|---|
| 주소 | `https://skynet-api.skyzkorea.net` (Route53 `skyzkorea.net` 영역의 A 레코드 → 고정 IP 13.209.254.132) |
| 서버 | EC2 `skynet-supabase` (t3.large, Ubuntu 24.04, 80GB 암호화 gp3, 리전 ap-northeast-2, 기본 VPC) |
| 설치 위치 | 서버의 `/opt/skynet` (공식 `supabase/docker` 사본 + 우리 파일: `.env`, `docker-compose.skynet.yml`, `volumes/functions/*`, `migrations/`) |
| 구성 | Postgres 17(pg_cron·pg_net·vault 포함), GoTrue(인증), PostgREST, Realtime, Storage(파일은 서버 디스크 `volumes/storage`), Edge Runtime(함수), Studio, Envoy, Caddy(TLS 자동 발급) |
| 관리 화면 | `https://skynet-api.skyzkorea.net/` — 아이디·비밀번호는 Secrets Manager `skynet/supabase` 의 `DASHBOARD_USERNAME/PASSWORD` |
| 비밀값 | 서버 `/opt/skynet/.env` 가 원본, AWS Secrets Manager `skynet/supabase` 가 사본 (DB 비밀번호, JWT 비밀, anon/service 키, 푸시 키) |
| 방화벽 | 보안 그룹 `skynet-supabase-sg`: 80·443 만 열림. DB 포트는 바깥에 안 열림 |
| 백업 | DLM 정책이 매일 03:00(KST) 디스크 스냅샷, 7일 보관 |
| 만든 자원 목록 | 저장소의 `aws_resources.txt` |

**서버에 들어가기** (AWS 자격 증명 + Session Manager 플러그인 필요)

```bash
aws ssm start-session --target i-00e5148840f434793 --region ap-northeast-2
sudo -i && cd /opt/skynet
docker compose ps                      # 상태
docker compose logs -f functions       # 서버 함수 로그
docker exec -it supabase-db psql -U postgres   # DB 콘솔
```

**바꾼 것을 올리는 법**

1. **DB 마이그레이션**: 새 `supabase/migrations/*.sql` 파일을 서버 `/opt/skynet/migrations/` 에 복사한 뒤
   `docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < 파일.sql`. (설치 때 21개 전부 적용됨)
2. **서버 함수**: `supabase/functions/<이름>/index.ts` 를 서버 `/opt/skynet/volumes/functions/<이름>/index.ts` 에 복사하고 `docker compose restart functions`.
   `axiom` 만은 `bash scripts/deploy-axiom.sh` 로 한 파일로 묶은 결과를 복사합니다. JWT 확인은 전역으로 꺼져 있고(`FUNCTIONS_VERIFY_JWT=false`),
   `admin-accounts`·`board-upload` 는 함수 안에서 호출자의 토큰을 직접 확인합니다.
3. **함수 비밀값**: 서버 `.env` 를 고치고 `docker compose up -d` (바뀐 컨테이너만 다시 뜸).
4. 파일 전달은 S3 버킷 `skynet-supabase-deploy-219028344147` 에 올린 뒤 서버에서 `aws s3 cp` 로 받는 방법이 편합니다 (서버 역할에 읽기 권한 있음).

**첫 관리자** (새로 설치했을 때 한 번): `node scripts/supabase-first-admin.mjs` — 2026-11-16 설치 때 `admin` 계정을 만들어 두었습니다.

**옛 클라우드 프로젝트의 데이터 옮기기** (아직 안 함): 옛 프로젝트의 DB 비밀번호가 있으면 `pg_dump` → 서버 `psql` 로 넣고, 저장소 파일은 service 키로 내려받아 `volumes/storage` 에 넣습니다.

## 웹 배포 (GitHub Pages)

```bash
set -a && . ./.env && set +a
bash scripts/build-web.sh --deploy    # 빌드 후 gh-pages 가지에 올림
```

앱 설치(PWA) 정보와 서비스 워커를 붙여 줍니다. 배포 후 사용자는 Ctrl+F5로 새로고침해야 새 버전이 보입니다.
PC 앱 설치: 크롬·엣지에서 왼쪽 메뉴 아래 또는 MY 탭의 「PC 앱으로 설치」(`src/core/install.ts`, 브라우저의 설치 요청을 받아 둠)를 누르면 주소창 없는 앱 창으로 열리고 작업표시줄에 고정됩니다. 화면·알림은 웹과 같습니다.
주의: 무료 GitHub에서 저장소를 비공개로 바꾸면 Pages가 멈춥니다 (GitHub Pro 또는 다른 호스팅 필요).

## 안드로이드 APK

GitHub Actions의 `android-apk` 작업이 만듭니다. Actions 화면에서 직접 실행(workflow_dispatch)하거나, 커밋 메시지에 `[apk]`를 넣으면 돕니다.
결과는 실행 화면의 `rightnow-apk` 파일(30일 보관)입니다. 지금은 임시 서명 키라서, 정식 키로 바꾸면 폰에서 한 번 지우고 다시 설치해야 합니다.
폰 푸시는 Expo 계정과 Firebase 프로젝트, 아이폰은 Apple 개발자 계정이 추가로 필요합니다.

## SKYZAI(song_mu) 메신저 연결 (2026-11-18)
SKYZAI(송무 플랫폼, `AI-SERVICE/song_mu`)의 메신저 화면은 그대로 두고 **저장소를 이 서버로 바꿨습니다.** SKYZAI 에서 나눈 대화가 스카이넷 앱에 그대로 보이고, 반대도 같습니다 — 같은 `rooms`·`messages` 입니다.
- 사람: 대륜탑 사번이 공통 키. SKYZAI 는 사번(소문자 `profiles.login_id`)으로 주고받고 이름·직위는 자기 ERP 에서 붙입니다.
- 세션: SKYZAI 서버가 함수 `skyzai-bridge` 에 공유 비밀(`DAERYUNTOP_BRIDGE_KEY`, SKYZAI 쪽 이름 `SKYNET_BRIDGE_KEY`)을 보이면 그 사번의 계정을 찾거나 만들고 **그 사람의 세션 토큰**을 줍니다. SKYZAI 는 그 토큰으로 PostgREST(`rpc/skyzai_*`)·Storage 를 '그 사람으로서' 부르므로 권한은 앱과 똑같이 RLS·`auth.uid()` 가 지킵니다. 서비스 키·JWT 비밀은 SKYZAI 에 주지 않습니다.
- DB: `messages.seq`(커지는 정수 — SKYZAI 화면이 글 번호를 정수로 가정), `messages.edited_at` + `edit_message`(글 고치기, 앱은 바뀐 글을 그대로 보여 줌), 공감이 바뀌면 `updated_at` 을 올리는 트리거, 화면 모양으로 묶어 주는 `skyzai_rooms`·`skyzai_messages`·`skyzai_sync` 등. 시험은 `supabase/tests/rls_test.sql` 의 'SKYZAI:' 항목.
- SKYZAI 가 올린 파일은 `room-files/<방 id>/skyzai/<첨부 id>.<확장자>`. 공지·초대·나가기·이름 바꾸기는 방에 `system` 글 한 줄을 남겨 두 앱 모두에 보입니다.
- SKYZAI 쪽 코드: `build/integrated/services/skynet.py`(연결), `services/messenger.py`(화면 모양), 환경변수 `SKYNET_URL`·`SKYNET_ANON_KEY`·`SKYNET_BRIDGE_KEY`.
배포 순서: (1) 위 마이그레이션을 서버 DB 에 적용 (2) `skyzai-bridge/index.ts` 를 `/opt/skynet/volumes/functions/skyzai-bridge/` 에 복사하고 `docker compose restart functions` (3) SKYZAI 에 환경변수 3개 넣고 재배포.

## 꼭 지킬 것

- **운영 중인 대륜탑은 바꾸지 않습니다.** 대륜탑 쪽에 쓰는 일은 없습니다 — 기일은 대륜탑이 이 앱으로 보내고(`daeryuntop-hearing`), 구성원 명단은 이 앱이 읽기 전용 계정으로 SELECT 만 합니다(`daeryuntop-sync`).
- 비밀 키(관리자 키, AI 키)는 Supabase Secrets에만. 저장소·채팅·로그에 넣지 않습니다.
- 배당 안내(`messages.staff_only`)는 의뢰인에게 보이지 않아야 합니다 (RLS와 푸시 모두에서 제외).
- AI 규칙: 변호사가 없는 방에서는 일반 정보만, 사건방·상담방에서는 `@AI` 차단(`@AI 띠지`만 예외, AI를 쓰지 않음).

## 실제 의뢰인 자료를 넣기 전에 할 일

- 개인정보 처리위탁·국외이전 고지 (Supabase, 해외 AI, 휴대폰 연락처 저장 포함)
- 관리자 2단계 로그인, 접속 기록 1년 이상 보관
- AI 키를 대륜 명의로 교체
- 정식 안드로이드 서명 키, 저장소 비공개 전환 검토
