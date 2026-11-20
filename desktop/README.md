# SKYNET PC 앱 (Windows · Mac)

Electron 껍데기입니다. 화면은 배포된 웹(`https://seoseungdeock-cloud.github.io/-/`)을 그대로 띄우므로 **앱 기능이 바뀌어도 재설치가 필요 없습니다** — 웹을 배포하면 모든 PC 가 다음 실행 때 새 버전이 됩니다. 이 폴더를 다시 빌드할 때는 껍데기 자체(트레이·알림·아이콘)가 바뀌었을 때만입니다.

PC 앱만 하는 일:
- 트레이(메뉴 막대) 아이콘 — 열기 · 로그인 시 자동 실행 · 시작할 때 창 숨기기 · 새로 고침 · 종료
- 안 읽은 메시지 수 → Mac Dock 배지 / Windows 작업표시줄 덧아이콘
- 새 메시지 → 운영체제 알림 (창을 보고 있으면 생략, 방 알림 설정 「멘션만/끄기」 존중). 알림을 누르면 그 방이 열림
- 창 닫기 = 트레이로 숨기기 (종료는 트레이 메뉴 또는 Mac `Cmd+Q`), 중복 실행 방지, 외부 링크는 기본 브라우저로
- 인터넷이 끊기면 안내 화면 → 15초마다 재시도

웹 쪽 연결 코드: `src/core/desktop.ts` (배지·알림), `src/ui/shell.tsx` (`useUnread`, `useDesktopOpenRoom`), `src/core/store.ts` (`onMessageRow` 에서 새 글 알림). PC 앱 안인지 판별은 `isDesktopApp()`.

## 빌드
```bash
cd desktop
npm install
npm run icons        # assets/brand SVG → build/icon.png·icns·ico, 트레이 PNG (Mac 에서)
npm run build:mac    # dist/SKYNET-1.0.0-universal.dmg (Intel+Apple Silicon)
npm run build:win    # dist/SKYNET-Setup-1.0.0.exe (설치), SKYNET-Portable-1.0.0.exe (설치 없이 실행)
```
Windows 설치 파일도 Mac 에서 만들어집니다 (wine 불필요). `--mac --win` 을 한 번에 돌리면 universal 설정이 Windows 로 새어 들어가 실패하므로 **따로** 돌립니다.

로컬 개발 서버에 붙여 보기: `SKYNET_URL=http://localhost:8082 npm start`
화면 저장(개발용): `SKYNET_SHOT=/tmp/a.png npm start` → 7초 뒤 저장.

## 서명 (나중에)
지금은 서명 없이 배포합니다. 처음 열 때 Mac 은 「확인되지 않은 개발자」(우클릭 → 열기 또는 시스템 설정 → 개인정보 보호 및 보안 → 「그래도 열기」), Windows 는 SmartScreen 「추가 정보 → 실행」을 한 번 거칩니다.
- Mac: Apple Developer 계정($99/년) → `CSC_LINK`/`CSC_KEY_PASSWORD` 환경변수 + `hardenedRuntime: true` + notarize 설정.
- Windows: 코드서명 인증서(OV/EV) → `CSC_LINK`/`CSC_KEY_PASSWORD`. 서명하면 SmartScreen 경고가 사라집니다(EV 는 즉시, OV 는 평판 누적 뒤).

## 설정
사용자 데이터 폴더의 `config.json` (Mac `~/Library/Application Support/SKYNET/`, Windows `%APPDATA%\SKYNET\`):
`url`(서버 주소), `startHidden`, `bounds`(창 위치). 환경변수 `SKYNET_URL` 이 있으면 그것이 우선.

## 자동 업데이트
껍데기는 바뀔 일이 적어 아직 넣지 않았습니다. 필요해지면 `electron-updater` + GitHub Releases(또는 S3) 로 붙입니다.
