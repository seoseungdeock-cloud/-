-- 남은 불변기간 아침 알림 (승덕 요청 2026-10-21): 매일 오전 8시 30분, 담당 변호사에게 조치 안 한 불변기간을 모아 한 번 알립니다.
-- 대상: 2주 안에 만료되거나 도과한 지 7일 안 된 것 (사건 알림을 어드민이 끈 사건은 빼기). 가까운 3건을 본문에, 나머지는 '외 N건'.

create table public.limit_digest_sent (
  user_id uuid not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.limit_digest_sent enable row level security;
revoke all on public.limit_digest_sent from anon, authenticated;
grant all on public.limit_digest_sent to service_role;

create function public.enqueue_limit_digest(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  local_now timestamp := p_now at time zone 'Asia/Seoul';
  today date := local_now::date;
  n int;
begin
  -- 8:30부터 3시간 안에 한 번 (예약 작업이 잠시 멈췄다 돌아와도 보냄)
  if local_now < today + time '08:30' or local_now >= today + time '11:30' then return 0; end if;
  with items as (
    select l.uid, d.due_date, d.room_id,
      case when d.due_date < today then '도과' when d.due_date = today then '오늘 만료' else 'D-' || (d.due_date - today) end
        || ' ' || d.label || ' · ' || c.title as line
    from case_deadlines d
    join cases c on c.room_id = d.room_id
    cross join lateral deadline_lawyers(d.room_id, d.lawyer_id) as l(uid)
    where d.handled_at is null and c.deadline_alerts and d.due_date between today - 7 and today + 14
  ), per as (
    select uid, count(*)::int as cnt, (array_agg(line order by due_date, line))[1:3] as top, (array_agg(room_id order by due_date))[1] as first_room
    from items group by uid
  ), marked as (
    insert into limit_digest_sent (user_id, day) select uid, today from per on conflict do nothing returning user_id
  )
  insert into push_outbox (user_id, title, body, data)
  select p.uid, '남은 불변기간 ' || p.cnt || '건',
    array_to_string(p.top, E'\n') || case when p.cnt > 3 then E'\n외 ' || (p.cnt - 3) || '건' else '' end,
    jsonb_build_object('kind', 'deadline', 'roomId', p.first_room)
  from per p join marked m on m.user_id = p.uid;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.enqueue_limit_digest(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_limit_digest(timestamptz) to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('push-send', '* * * * *', 'select public.enqueue_deadline_alerts(); select public.enqueue_limit_digest(); select public.kick_push()');
  end if;
end $$;
