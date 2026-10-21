-- 승덕 요청 2026-10-21: AXIOM v0.1(경영관리 엔진)을 업무 탭에 다시 만들어 넣음.
-- AXIOM 의 SQLite 표를 ax_* 표로 옮겼습니다. 앱은 표를 직접 읽거나 쓰지 않고, 서버 함수 'axiom' 만 씁니다
-- (함수가 어드민 계정인지 확인하고 AXIOM 의 공개 등급 규칙을 그대로 적용). 그래서 표에는 열람 규칙(정책)을 두지 않습니다.
-- 시각은 AXIOM 과 같이 ISO 문자열(text)로 둡니다.

create table public.ax_documents (
  id text primary key,
  kind text not null,
  title text not null,
  body text not null default '',
  visibility text not null default 'org',
  author_id text,
  agent_id text,
  run_id text,
  ref_type text,
  ref_id text,
  tags jsonb not null default '[]',
  rev int not null default 1,
  created_at text not null,
  updated_at text not null
);
create index ax_documents_kind on public.ax_documents (kind, updated_at desc);
create index ax_documents_ref on public.ax_documents (ref_type, ref_id);

create table public.ax_doc_revisions (
  doc_id text not null references public.ax_documents (id) on delete cascade,
  rev int not null,
  title text not null,
  body text not null,
  edited_by text,
  at text not null,
  primary key (doc_id, rev)
);

create table public.ax_agents (
  id text primary key,
  slug text not null unique,
  name text not null,
  team text,
  role text,
  origin text not null default 'instance',
  current_version int not null default 1,
  engine_def_version int,
  author_id text,
  archived boolean not null default false,
  run_count int not null default 0,
  last_run_at text,
  created_at text not null,
  updated_at text not null
);

create table public.ax_agent_versions (
  agent_id text not null references public.ax_agents (id) on delete cascade,
  version int not null,
  prompt text not null,
  modes jsonb not null default '{}',
  model text not null default 'tier:balanced',
  provider_preference text,
  manual jsonb not null default '{}',
  change_note text,
  created_by text,
  created_at text not null,
  primary key (agent_id, version)
);

create table public.ax_conversations (
  id text primary key,
  agent_id text,
  user_id text,
  title text,
  visibility text not null default 'org',
  doc_id text,
  created_at text not null,
  updated_at text not null
);

create table public.ax_messages (
  id text primary key,
  conversation_id text not null references public.ax_conversations (id) on delete cascade,
  role text not null,
  content text not null,
  run_id text,
  user_id text,
  created_at text not null,
  seq bigint not null default 0
);
create index ax_messages_conv on public.ax_messages (conversation_id, created_at, seq);

create table public.ax_runs (
  id text primary key,
  agent_id text,
  agent_slug text,
  agent_version int,
  mode text,
  council_id text,
  work_order_id text,
  user_id text,
  visibility text not null default 'org',
  provider text,
  model text,
  note text,
  input jsonb,
  output jsonb,
  raw text,
  flags jsonb not null default '[]',
  status text not null,
  error text,
  tokens_in int default 0,
  tokens_out int default 0,
  cost_usd double precision,
  started_at text not null,
  finished_at text
);
create index ax_runs_started on public.ax_runs (started_at desc);
create index ax_runs_council on public.ax_runs (council_id);
create index ax_runs_work on public.ax_runs (work_order_id);

create table public.ax_councils (
  id text primary key,
  title text not null,
  meeting_doc_id text,
  state_doc_id text,
  objective text,
  status text not null,
  step text,
  result jsonb not null default '{}',
  interventions jsonb not null default '[]',
  warnings jsonb not null default '[]',
  visibility text not null default 'org',
  record_doc_id text,
  error text,
  run_token text,
  created_by text,
  created_at text not null,
  updated_at text not null
);

create table public.ax_approvals (
  id text primary key,
  kind text not null,
  tier text not null,
  team text,
  title text not null,
  summary text,
  payload jsonb not null default '{}',
  ref_type text,
  ref_id text,
  visibility text not null default 'org',
  status text not null default 'pending',
  requested_by text,
  decided_by text,
  decision text,
  decision_comment text,
  created_at text not null,
  decided_at text
);
create index ax_approvals_status on public.ax_approvals (status, created_at desc);
create index ax_approvals_ref on public.ax_approvals (ref_type, ref_id);

create table public.ax_work_orders (
  id text primary key,
  council_id text,
  team text not null,
  agent_slug text,
  title text not null,
  detail text,
  deliverable text,
  notes jsonb not null default '[]',
  status text not null,
  tier text,
  run_id text,
  deliverable_doc_id text,
  visibility text not null default 'org',
  created_at text not null,
  updated_at text not null
);
create index ax_work_orders_council on public.ax_work_orders (council_id);

create table public.ax_forecasts (
  id text primary key,
  council_id text,
  strategy_name text,
  metric text,
  unit text,
  horizon text,
  conservative double precision,
  base double precision,
  optimistic double precision,
  check_date text,
  assumptions jsonb not null default '[]',
  provider text,
  model text,
  agent_version int,
  actual double precision,
  actual_note text,
  actual_by text,
  actual_at text,
  visibility text not null default 'org',
  created_at text not null
);

create table public.ax_schedules (
  id text primary key,
  name text not null,
  team text,
  spec text not null,
  enabled boolean not null default true,
  last_run_at text,
  created_by text,
  created_at text not null
);

create table public.ax_audit (
  id text primary key,
  user_id text,
  action text,
  target text,
  detail text,
  at text not null
);
create index ax_audit_at on public.ax_audit (at desc);

do $$
declare t text;
begin
  foreach t in array array['ax_documents', 'ax_doc_revisions', 'ax_agents', 'ax_agent_versions', 'ax_conversations', 'ax_messages', 'ax_runs',
                           'ax_councils', 'ax_approvals', 'ax_work_orders', 'ax_forecasts', 'ax_schedules', 'ax_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- 정기 보고: 5분마다 서버 함수 'axiom' 을 깨워 예정 시각이 지난 보고를 돌립니다.
-- 주소와 비밀값은 푸시 함수에 쓰는 것을 그대로 씁니다 (주소의 push-send → axiom).
create function public.kick_axiom() returns void language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  if not exists (select 1 from ax_schedules where enabled) then return; end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')$q$ into url, secret;
  if url is null or secret is null then return; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
    using replace(url, '/push-send', '/axiom'), jsonb_build_object('Content-Type', 'application/json', 'x-axiom-job', secret), '{"tick":true}'::jsonb;
exception when others then
  raise warning 'kick_axiom: %', sqlerrm;
end $$;
revoke execute on function public.kick_axiom() from public, anon, authenticated;
grant execute on function public.kick_axiom() to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('axiom-tick', '*/5 * * * *', 'select public.kick_axiom()');
  end if;
end $$;
