#!/usr/bin/env bash
# 로컬 Postgres 16에 Supabase 인증 흉내(auth 스키마·역할)를 만들고, 마이그레이션과 보안 규칙 시험을 돌립니다.
# 사용: bash supabase/tests/run.sh   (Postgres 16 필요, Supabase 계정 불필요)
#       EXPOSE=1 bash supabase/tests/run.sh   ('Automatically expose new tables'를 켠 경우)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
WORK=$(mktemp -d)
RUN=""; [ "$(id -u)" = 0 ] && { chown -R postgres "$WORK"; chmod 755 "$WORK"; RUN="runuser -u postgres --"; }
$RUN "$BIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
$RUN "$BIN/pg_ctl" -D "$WORK/data" -o "-p 55433 -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
trap '$RUN "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null; rm -rf "$WORK"' EXIT
PSQL="psql -h $WORK -p 55433 -U postgres -v ON_ERROR_STOP=1 -q -X"
$PSQL -c 'create database t'
$PSQL -d t -f "$ROOT/supabase/tests/auth_stub.sql"
[ "${EXPOSE:-0}" = 1 ] && $PSQL -d t -f "$ROOT/supabase/tests/expose_on.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d t -f "$f"; done
OUT=$($PSQL -d t -A -F ' | ' -t -f "$ROOT/supabase/tests/rls_test.sql")
echo "$OUT"
! echo "$OUT" | grep -q '^FAIL'
