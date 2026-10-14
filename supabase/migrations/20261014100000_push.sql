-- 2단계: 기일 폰 푸시.
-- 기일 알람(새 기일·변경·취소)이 생기면 확인할 사람 폰으로 바로 보내고,
-- 기일 7일 전·전날 오전 9시, 당일 오전 8시(한국 시간)에 방 사람 모두에게 미리 알립니다.
-- 보내기는 서버 함수 push-send가 Expo 푸시 서비스로 합니다. 카카오 알림톡·문자는 쓰지 않습니다(승덕 결정 2026-10-14).
-- 푸시 문구(사건명·법원 장소 포함)는 20261014110000_push_case_text.sql에서 정합니다.

-- 폰마다 하나의 푸시 주소. 같은 폰에서 다른 계정으로 로그인하면 새 계정으로 옮겨 갑니다.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default '',
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);

-- 보낼 푸시 (서버만 읽고 씀)
create table public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  tries int not null default 0,
  sent_at timestamptz,
  error text
);
create index push_outbox_pending on public.push_outbox (id) where sent_at is null;

-- 미리 알림을 이미 보냈는지 (기일 날짜가 바뀌면 새 날짜 기준으로 다시 보냄)
create table public.hearing_reminders_sent (
  hearing_id uuid not null,
  slot text not null,
  date date not null,
  sent_at timestamptz not null default now(),
  primary key (hearing_id, slot, date)
);

alter table public.hearing_alerts add column reminded_at timestamptz;

alter table public.push_tokens enable row level security;
alter table public.push_outbox enable row level security;
alter table public.hearing_reminders_sent enable row level security;
revoke all on public.push_tokens, public.push_outbox, public.hearing_reminders_sent from anon, authenticated;
grant all on public.push_tokens, public.push_outbox, public.hearing_reminders_sent to service_role;
grant all on all sequences in schema public to service_role;

-- 2026-11-19, 10:00 → 11월 19일(목) 10:00
create function public.push_when(p_date date, p_time time) returns text language sql immutable set search_path = public as $$
  select extract(month from p_date)::int || '월 ' || extract(day from p_date)::int || '일('
    || (array['일','월','화','수','목','금','토'])[extract(dow from p_date)::int + 1] || ')'
    || coalesce(' ' || to_char(p_time, 'HH24:MI'), '')
$$;

-- 서버 함수 push-send를 깨웁니다 (Supabase의 pg_net·vault가 있을 때만; 로컬 시험에서는 아무것도 안 함).
-- 실패해도 기일 저장은 그대로 되고, 1분마다 도는 예약 작업이 다시 보냅니다.
create function public.kick_push() returns void language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')$q$ into url, secret;
  if url is null or secret is null then return; end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
    using url, jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret), '{}'::jsonb;
exception when others then
  raise warning 'kick_push: %', sqlerrm;
end $$;

-- 기일 알람 받을 사람이 정해지면(확인 전인 사람만) 푸시를 쌓습니다
create function public.queue_hearing_push() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into push_outbox (user_id, title, body, data)
  select n.user_id,
    case a.change when 'new' then '새 기일' when 'changed' then '기일 변경' else '기일 취소' end,
    a.label || ' ' || case
      when a.change = 'changed' and a.prev_date is not null then push_when(a.prev_date, a.prev_time) || ' → ' || push_when(a.date, a.time)
      when a.change = 'cancelled' then push_when(a.date, a.time) || ' (취소)'
      else push_when(a.date, a.time) end || E'\n앱에서 확인해 주세요.',
    jsonb_build_object('kind', 'hearing', 'roomId', a.room_id, 'alertId', a.id)
  from new_rows n join hearing_alerts a on a.id = n.alert_id
  where n.acked_at is null;
  if found then perform kick_push(); end if;
  return null;
end $$;
create trigger hearing_alert_push after insert on public.hearing_alert_recipients
  referencing new table as new_rows for each statement execute function public.queue_hearing_push();

-- 앱: 이 폰의 푸시 주소 등록 / 해제
create function public.register_push_token(p_token text, p_platform text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '다시 로그인해 주세요.'; end if;
  if p_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then raise exception '푸시 주소가 올바르지 않습니다.'; end if;
  insert into push_tokens (token, user_id, platform) values (p_token, auth.uid(), coalesce(p_platform, ''))
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid()
$$;

-- '다시 알리기' (담당 변호사·직원): 아직 확인 안 한 사람 폰으로 다시 보냅니다. 같은 알람은 10분에 한 번.
create function public.remind_hearing(p_alert uuid) returns int language plpgsql security definer set search_path = public as $$
declare a hearing_alerts; n int;
begin
  select * into a from hearing_alerts where id = p_alert;
  if a.id is null or not exists (select 1 from hearing_alert_recipients where alert_id = p_alert and user_id = auth.uid()) then
    raise exception '알람을 찾을 수 없습니다.';
  end if;
  if not (is_firm() and is_member(a.room_id)) then raise exception '담당 변호사·직원만 다시 알릴 수 있습니다.'; end if;
  if a.reminded_at > now() - interval '10 minutes' then raise exception '방금 다시 알렸습니다. 10분 뒤에 다시 해 주세요.'; end if;
  update hearing_alerts set reminded_at = now() where id = p_alert;
  insert into push_outbox (user_id, title, body, data)
  select r.user_id, '기일 알람 확인 요청', a.label || ' ' || push_when(a.date, a.time) || E'\n앱에서 확인해 주세요.',
    jsonb_build_object('kind', 'hearing', 'roomId', a.room_id, 'alertId', a.id)
  from hearing_alert_recipients r where r.alert_id = p_alert and r.acked_at is null;
  get diagnostics n = row_count;
  if n > 0 then perform kick_push(); end if;
  return n;
end $$;

-- 미리 알림: 7일 전·전날 오전 9시, 당일 오전 8시(한국 시간). 예약 작업이 1분마다 부릅니다.
-- 그 시각이 지난 지 3시간 안의 것만 보냅니다(늦게 잡힌 기일에 지난 알림을 몰아 보내지 않음).
create function public.enqueue_hearing_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    select h.id, h.room_id, h.label, h.date, h.time, s.slot, s.title
    from hearings h
    cross join lateral (values
      ('d7', '기일 7일 전', (h.date - 7) + time '09:00'),
      ('d1', '내일 기일', (h.date - 1) + time '09:00'),
      ('d0', '오늘 기일', h.date + time '08:00')
    ) as s(slot, title, local_at)
    where (s.local_at at time zone 'Asia/Seoul') <= p_now
      and (s.local_at at time zone 'Asia/Seoul') > p_now - interval '3 hours'
      and not exists (select 1 from hearing_reminders_sent x where x.hearing_id = h.id and x.slot = s.slot and x.date = h.date)
  ), marked as (
    insert into hearing_reminders_sent (hearing_id, slot, date) select id, slot, date from due
    on conflict do nothing returning hearing_id, slot
  )
  insert into push_outbox (user_id, title, body, data)
  select m.user_id, d.title, d.label || ' ' || push_when(d.date, d.time),
    jsonb_build_object('kind', 'reminder', 'roomId', d.room_id, 'hearingId', d.id)
  from due d join marked k on k.hearing_id = d.id and k.slot = d.slot
  join room_members m on m.room_id = d.room_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- push-send가 보낼 묶음을 가져갑니다 (두 번 보내지 않도록 잠금). 2분 안에 끝내지 못한 것은 다시 가져갈 수 있고, 세 번까지만.
create function public.claim_push_batch(p_limit int default 500)
returns table (id bigint, user_id uuid, title text, body text, data jsonb, tokens text[])
language plpgsql security definer set search_path = public as $$
begin
  delete from push_outbox o where o.created_at < now() - interval '30 days';
  return query
  with picked as (
    select o.id from push_outbox o
    where o.sent_at is null and o.tries < 3 and (o.claimed_at is null or o.claimed_at < now() - interval '2 minutes')
    order by o.id limit p_limit for update skip locked
  ), upd as (
    update push_outbox o set claimed_at = now(), tries = o.tries + 1 from picked where o.id = picked.id
    returning o.id, o.user_id, o.title, o.body, o.data
  )
  select u.id, u.user_id, u.title, u.body, u.data,
    coalesce((select array_agg(t.token) from push_tokens t where t.user_id = u.user_id), '{}')
  from upd u order by u.id;
end $$;

create function public.finish_push(p_ids bigint[], p_error text default null) returns void
language sql security definer set search_path = public as $$
  update push_outbox set sent_at = now(), error = p_error where id = any (p_ids)
$$;

-- 함수 권한: 앱은 등록·해제·다시 알리기만. 나머지는 서버만.
revoke execute on function public.push_when(date, time), public.kick_push(), public.queue_hearing_push(),
  public.register_push_token(text, text), public.unregister_push_token(text), public.remind_hearing(uuid),
  public.enqueue_hearing_reminders(timestamptz), public.claim_push_batch(int), public.finish_push(bigint[], text)
  from public, anon, authenticated;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text), public.remind_hearing(uuid)
  to authenticated;
grant execute on function public.push_when(date, time), public.kick_push(), public.register_push_token(text, text),
  public.unregister_push_token(text), public.remind_hearing(uuid), public.enqueue_hearing_reminders(timestamptz),
  public.claim_push_batch(int), public.finish_push(bigint[], text)
  to service_role;

-- 예약 작업: Supabase에서만 (pg_cron·pg_net이 있을 때). 1분마다 push-send를 깨워 미리 알림을 쌓고 남은 푸시를 보냅니다.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('push-send', '* * * * *', 'select public.kick_push()');
  end if;
end $$;
