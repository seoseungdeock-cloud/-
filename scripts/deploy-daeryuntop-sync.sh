#!/usr/bin/env bash
# 대륜탑 구성원 명단 동기화(daeryuntop-sync)를 스카이넷 서버에 올리고 한 번 돌립니다.
#
# 사용 (AWS 자격 증명이 있는 터미널에서, MFA 는 묻는 대로 입력):
#   DAERYUNTOP_DB_URL='postgresql://계정:비밀번호@호스트:5432/디비' bash scripts/deploy-daeryuntop-sync.sh
#     · 대륜탑 DB 주소. 뒤의 ?schema=... 같은 꼬리는 떼고 줍니다. 읽기 전용 계정이면 가장 좋습니다 (함수는 SELECT 만 합니다).
#   선택: DAERYUNTOP_SYNC_SECRET (없으면 새로 만듦), SKIP_RUN=1 (올리기만 하고 동기화는 안 돌림)
#
# 하는 일 (서버 안에서는 SSM Run Command 로 실행):
#   1) 함수 index.ts 와 마이그레이션 SQL 을 배포용 S3 버킷에 올리고 서버가 받아 감
#   2) 서버 /opt/skynet/.env 에 DAERYUNTOP_DB_URL, DAERYUNTOP_SYNC_SECRET 추가 (이미 있으면 바꿈)
#   3) DB 에 마이그레이션 적용 + Vault 에 daeryuntop_sync_url / daeryuntop_sync_secret
#   4) 함수 컨테이너 다시 띄움 → 서버에서 함수를 한 번 불러 결과를 보여 줌
#   5) S3 에 올린 비밀 파일은 바로 지움
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
REGION=ap-northeast-2
INSTANCE=${SKYNET_INSTANCE:-i-00e5148840f434793}
BUCKET=${SKYNET_DEPLOY_BUCKET:-skynet-supabase-deploy-219028344147}
API=${SKYNET_API:-https://skynet-api.skyzkorea.net}
: "${DAERYUNTOP_DB_URL:?DAERYUNTOP_DB_URL 이 필요합니다 (대륜탑 DB 주소)}"
case "$DAERYUNTOP_DB_URL" in *\?*) echo "DB 주소 뒤의 ?... 꼬리는 떼 주세요"; exit 1;; esac
SECRET=${DAERYUNTOP_SYNC_SECRET:-$(openssl rand -hex 24)}
STAMP=$(date +%Y%m%d%H%M%S)
PREFIX="deploy/daeryuntop-sync-$STAMP"

echo "· AWS 계정 확인"; aws sts get-caller-identity --query Account --output text --region "$REGION"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cp "$ROOT/supabase/functions/daeryuntop-sync/index.ts" "$TMP/index.ts"
cp "$ROOT/supabase/migrations/20261119000000_daeryuntop_sync.sql" "$TMP/migration.sql"
# 비밀값은 파일 하나에 담아 올리고, 서버가 받은 뒤 바로 지웁니다
printf 'DAERYUNTOP_DB_URL=%s\nDAERYUNTOP_SYNC_SECRET=%s\n' "$DAERYUNTOP_DB_URL" "$SECRET" > "$TMP/env.part"
chmod 600 "$TMP/env.part"
echo "· 파일 올리기 → s3://$BUCKET/$PREFIX/"
aws s3 cp "$TMP/index.ts" "s3://$BUCKET/$PREFIX/index.ts" --region "$REGION" --only-show-errors
aws s3 cp "$TMP/migration.sql" "s3://$BUCKET/$PREFIX/migration.sql" --region "$REGION" --only-show-errors
aws s3 cp "$TMP/env.part" "s3://$BUCKET/$PREFIX/env.part" --region "$REGION" --only-show-errors --sse AES256

# 서버에서 돌릴 스크립트
REMOTE=$(cat <<EOS
set -euo pipefail
cd /opt/skynet
aws s3 cp s3://$BUCKET/$PREFIX/index.ts /tmp/ds-index.ts --only-show-errors
aws s3 cp s3://$BUCKET/$PREFIX/migration.sql /tmp/ds-migration.sql --only-show-errors
aws s3 cp s3://$BUCKET/$PREFIX/env.part /tmp/ds-env.part --only-show-errors
aws s3 rm s3://$BUCKET/$PREFIX/env.part --only-show-errors || true
mkdir -p volumes/functions/daeryuntop-sync migrations
cp /tmp/ds-index.ts volumes/functions/daeryuntop-sync/index.ts
cp /tmp/ds-migration.sql migrations/20261119000000_daeryuntop_sync.sql
# .env 갱신 (있으면 바꾸고 없으면 덧붙임)
while IFS= read -r line; do
  key=\${line%%=*}
  if grep -q "^\$key=" .env; then sed -i "s|^\$key=.*|\$line|" .env; else echo "\$line" >> .env; fi
done < /tmp/ds-env.part
# 서버에서 대륜탑 DB 에 닿는지 (SELECT 1)
DBURL=\$(grep '^DAERYUNTOP_DB_URL=' .env | cut -d= -f2-)
docker exec supabase-db psql "\$DBURL" -X -At -c 'select count(*) from admin_user where deleted_at is null and coalesce(approve_state,false)' \
  && echo "대륜탑 연결 OK" || { echo "서버에서 대륜탑 DB 에 연결하지 못했습니다 (대륜탑 DB 보안 그룹에 이 서버 IP 13.209.254.132 허용 필요)"; exit 2; }
# 마이그레이션 + Vault
docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < /tmp/ds-migration.sql
SYNC_SECRET=\$(grep '^DAERYUNTOP_SYNC_SECRET=' .env | cut -d= -f2-)
docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
do \\\$\\\$
declare u text := '$API/functions/v1/daeryuntop-sync'; s text := '\$SYNC_SECRET'; id uuid;
begin
  select vs.id into id from vault.secrets vs where vs.name = 'daeryuntop_sync_url';
  if id is null then perform vault.create_secret(u, 'daeryuntop_sync_url'); else perform vault.update_secret(id, u); end if;
  select vs.id into id from vault.secrets vs where vs.name = 'daeryuntop_sync_secret';
  if id is null then perform vault.create_secret(s, 'daeryuntop_sync_secret'); else perform vault.update_secret(id, s); end if;
end \\\$\\\$;
SQL
docker compose up -d --quiet-pull 2>/dev/null || docker compose up -d
docker compose restart functions
rm -f /tmp/ds-env.part /tmp/ds-index.ts /tmp/ds-migration.sql
echo "배포 완료"
if [ "${SKIP_RUN:-0}" != 1 ]; then
  sleep 8
  echo "· 첫 동기화 실행"
  curl -sS -m 180 -X POST "$API/functions/v1/daeryuntop-sync" -H "Content-Type: application/json" -H "x-sync-secret: \$SYNC_SECRET" -d '{}'; echo
fi
EOS
)

echo "· 서버에서 실행 (SSM — 서버 기본 셸이 sh 라 bash 로 넘겨 실행)"
CMD_ID=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "deploy daeryuntop-sync $STAMP" --timeout-seconds 600 \
  --parameters "$(jq -n --arg c "$REMOTE" '{commands: [("cat > /tmp/ds.sh <<'"'"'DSEOF'"'"'\n" + $c + "\nDSEOF\nbash /tmp/ds.sh; rc=$?; rm -f /tmp/ds.sh; exit $rc")], executionTimeout: ["600"]}')" \
  --query 'Command.CommandId' --output text)
for _ in $(seq 1 90); do
  STATUS=$(aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Success|Failed|Cancelled|TimedOut) break;; esac
  sleep 5
done
aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
# S3 정리 (비밀 파일은 서버가 이미 지움; 나머지도 지움)
aws s3 rm "s3://$BUCKET/$PREFIX/" --recursive --region "$REGION" --only-show-errors || true
[ "$STATUS" = Success ] && echo "끝. 백오피스 → 대륜탑 연동에서 상태를 확인하세요." || { echo "실패: $STATUS"; exit 1; }
