#!/usr/bin/env bash
# 앱 ↔ 서버 끝까지 시험: 로컬 Postgres 16 + PostgREST(Supabase가 쓰는 것과 같은 프로그램) + 가짜 로그인 입구를 띄우고,
# 실제 앱 저장소(store)가 supabase-js로 로그인·쓰기·다시 불러오기를 하는지 확인합니다.
# 사용: bash supabase/tests/e2e.sh   (Postgres 16, 인터넷(PostgREST 내려받기) 필요. PGRST_BIN이 있으면 그 파일을 씀)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
WORK=$(mktemp -d)
PG_PORT=55434; REST_PORT=55435; GW_PORT=55436
SECRET=e2e-only-secret-not-used-anywhere-else-0123456789
RUN=""; [ "$(id -u)" = 0 ] && { chown -R postgres "$WORK"; chmod 755 "$WORK"; RUN="runuser -u postgres --"; }
PIDS=()
cleanup() {
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  $RUN "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

$RUN "$BIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
$RUN "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PG_PORT -k $WORK -c listen_addresses=localhost" -l "$WORK/log" -w start >/dev/null
PSQL="psql -h localhost -p $PG_PORT -U postgres -v ON_ERROR_STOP=1 -q -X"
$PSQL -c 'create database t'
$PSQL -d t -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d t -f "$f"; done
$PSQL -d t -c "create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;"

PGRST=${PGRST_BIN:-}
if [ -z "$PGRST" ]; then
  curl -sSL -o "$WORK/pgrst.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar xf "$WORK/pgrst.tar.xz" -C "$WORK"
  PGRST="$WORK/postgrest"
fi
PGRST_DB_URI="postgres://authenticator@localhost:$PG_PORT/t" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET=$SECRET PGRST_SERVER_PORT=$REST_PORT PGRST_LOG_LEVEL=error "$PGRST" >"$WORK/pgrst.log" 2>&1 &
PIDS+=($!)
node "$ROOT/supabase/tests/gateway.mjs" $GW_PORT $REST_PORT $SECRET localhost $PG_PORT >"$WORK/gw.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 50); do curl -s "localhost:$REST_PORT/" >/dev/null 2>&1 && curl -s "localhost:$GW_PORT/" >/dev/null 2>&1 && break; sleep 0.2; done

ANON=$(node -e "
const c=require('crypto');const b=(x)=>Buffer.from(JSON.stringify(x)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'anon'});
console.log(h+'.'+p+'.'+c.createHmac('sha256',process.argv[1]).update(h+'.'+p).digest('base64url'))" $SECRET)
cd "$ROOT"
EXPO_PUBLIC_SUPABASE_URL="http://localhost:$GW_PORT" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON" E2E_GATEWAY="http://localhost:$GW_PORT" \
  npx jest --no-cache --testMatch '**/__e2e__/*.e2e.ts' --setupFilesAfterEnv ./supabase/tests/e2e.setup.js "$@" || { echo '--- PostgREST'; tail -20 "$WORK/pgrst.log"; echo '--- gateway'; tail -20 "$WORK/gw.log"; exit 1; }
