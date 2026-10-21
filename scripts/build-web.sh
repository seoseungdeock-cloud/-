#!/usr/bin/env bash
# 실제 서버에 붙은 웹 버전을 만들어 GitHub Pages(gh-pages 가지)에 올립니다.
# 주소: https://seoseungdeock-cloud.github.io/-/   PC·폰 브라우저에서 '앱 설치'로 프로그램처럼 쓸 수 있습니다.
# 사용: bash scripts/build-web.sh [--deploy]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=${EXPO_BASE_URL:-/-}
OUT=$(mktemp -d)/web
cd "$ROOT"
EXPO_OFFLINE=1 EXPO_BASE_URL="$BASE" npx expo export --clear --platform web --output-dir "$OUT" >/dev/null
# 앱 설치(PWA): 설치 정보·아이콘·서비스 워커를 첫 화면에 연결
python3 - "$OUT/index.html" "$BASE" <<'PY'
import sys
p, base = sys.argv[1], sys.argv[2].rstrip('/')
s = open(p, encoding='utf-8').read()
head = (f'<link rel="manifest" href="{base}/manifest.webmanifest"/>'
        f'<meta name="theme-color" content="#A82235"/>'
        f'<link rel="apple-touch-icon" href="{base}/app-icon-192.png"/>'
        f'<meta name="apple-mobile-web-app-capable" content="yes"/>')
body = (f"<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('{base}/sw.js',{{scope:'{base}/'}})</script>")
s = s.replace('<html lang="en">', '<html lang="ko">').replace('</head>', head + '</head>', 1).replace('</body>', body + '</body>', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
cp "$OUT/index.html" "$OUT/404.html"   # 주소창에 하위 화면 주소를 바로 넣어도 열리게
touch "$OUT/.nojekyll"                # _expo 폴더를 GitHub Pages가 숨기지 않게
echo "built: $OUT"
if [ "${1:-}" = "--deploy" ]; then
  cd "$OUT"
  git init -q -b gh-pages
  git add -A
  git -c user.name="${GIT_AUTHOR_NAME:-Claude}" -c user.email="${GIT_AUTHOR_EMAIL:-noreply@anthropic.com}" commit -q -m "Web build $(cd "$ROOT" && git rev-parse --short HEAD)"
  git push -q -f "$(cd "$ROOT" && git remote get-url origin)" gh-pages
  echo "deployed"
fi
