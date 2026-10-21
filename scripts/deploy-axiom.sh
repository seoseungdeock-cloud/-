#!/usr/bin/env bash
# AXIOM 서버 함수 묶기·올리기. 엔진(src/core/axiom)을 함수와 한 파일로 묶어 Supabase 에 올립니다.
# 사용: bash scripts/deploy-axiom.sh [--deploy]
#   --deploy 없이: 묶기만 (결과 파일 경로를 알려 줌)
#   --deploy: SUPABASE_ACCESS_TOKEN(개인 접근 토큰, 환경변수로만)이 있어야 함
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${AXIOM_BUNDLE_DIR:-$(mktemp -d)}
REF=${SUPABASE_PROJECT_REF:-jzhzroexavltxrrjcbfa}

npx --yes esbuild@0.25.10 "$ROOT/supabase/functions/axiom/index.ts" --bundle --format=esm --platform=neutral --target=es2022 \
  --main-fields=module,main --external:'npm:*' --log-level=warning --outfile="$OUT/index.ts"

if [ "${1:-}" != "--deploy" ]; then
  echo "bundled: $OUT/index.ts"
  exit 0
fi
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN 이 필요합니다}"
curl -sS -f -X POST "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=axiom" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"axiom","verify_jwt":false}' \
  -F "file=@$OUT/index.ts" -o /dev/null -w 'deployed axiom (HTTP %{http_code})\n'
