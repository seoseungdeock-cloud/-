-- 대륜탑 구성원 명단 동기화 (2026-11-19)
-- 대륜탑(ERP) admin_user 를 읽기만 해서 스카이넷 계정을 맞춥니다. 실제 읽기·쓰기는 서버 함수 daeryuntop-sync 가 하고,
-- 여기서는 (1) 어디서 들어온 계정인지 표시하는 열, (2) 예약 작업이 함수를 부르는 통로, (3) 어드민이 손으로 돌리는 RPC 를 만듭니다.

-- 1) 계정 출처 — 'daeryuntop' 이면 동기화가 이름·직위·부서·지점·재직 여부를 관리합니다. null 이면 손으로 만든 계정(의뢰인·테스트)이라 건드리지 않습니다.
alter table public.profiles add column if not exists source text check (source in ('daeryuntop'));
alter table public.profiles add column if not exists synced_at timestamptz;
comment on column public.profiles.source is '계정 출처. daeryuntop = 대륜탑 명단 동기화가 관리';
comment on column public.profiles.synced_at is '대륜탑 명단과 마지막으로 맞춘 시각';

-- 이미 대륜탑 사번으로 로그인해 만들어진 계정(변호사·직원)은 동기화 대상으로 표시해 둡니다. 어드민·의뢰인은 제외.
update public.profiles set source = 'daeryuntop' where source is null and role in ('lawyer', 'staff') and firm = '대륜';

-- 2) 예약 작업 → 함수. Vault 비밀 'daeryuntop_sync_url', 'daeryuntop_sync_secret' 이 있어야 돕니다.
create or replace function public.kick_daeryuntop_sync() returns void language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'daeryuntop_sync_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'daeryuntop_sync_secret')$q$ into url, secret;
  if url is null or secret is null then return; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 60000)'
    using url, jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', secret), '{}'::jsonb;
exception when others then
  raise warning 'kick_daeryuntop_sync: %', sqlerrm;
end $$;
revoke all on function public.kick_daeryuntop_sync() from public;
grant execute on function public.kick_daeryuntop_sync() to service_role;

-- 매일 06:10 (한국 시간) = 전날 21:10 UTC. 사람이 적은 시간에 한 번.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'daeryuntop-sync';
    perform cron.schedule('daeryuntop-sync', '10 21 * * *', 'select public.kick_daeryuntop_sync()');
  end if;
end $$;

-- 3) 마지막 동기화 시각 (백오피스 표시용) — 누구나 읽어도 되는 값
create or replace function public.daeryuntop_sync_status()
returns table (synced_at timestamptz, synced_count bigint, inactive_count bigint)
language sql stable security definer set search_path = public as $$
  select max(synced_at), count(*) filter (where active), count(*) filter (where not active)
    from public.profiles where source = 'daeryuntop';
$$;
grant execute on function public.daeryuntop_sync_status() to authenticated;
