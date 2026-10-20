-- 불변기간 알림 (승덕 요청 2026-10-20).
-- 사건마다 불변기간(항소·상고·이의신청 기간 등)을 등록하고, 조치 완료 표시가 없으면 경고합니다.
--  · 3일 전 오전 9시(한국 시간): 담당 변호사와 대표 계정에 푸시
--  · 하루 전 24시(만료일 0시): 변호사 전용 '불변기간' 게시판에 경고 글 자동 게시(말머리 = 담당 변호사 사무소) + 푸시
--  · 만료 다음 날 0시(도과): 담당 변호사와 대표 계정에 도과 푸시
-- 어드민은 사건별로 알림을 끄고 켭니다. 대표 계정은 백오피스에서 어드민이 정합니다.
-- 대륜탑이 연결되면 대륜탑이 불변기간을 보내 줍니다(ingest_daeryuntop_deadline, 서버 함수 daeryuntop-deadline).

alter type public.board_kind add value if not exists 'deadline';

alter table public.profiles add column is_executive boolean not null default false;
alter table public.cases add column deadline_alerts boolean not null default true;
-- 대륜탑 사건 번호 (연동되면 대륜탑이 이 번호로 사건을 찾습니다)
alter table public.cases add column external_ref text unique;

create table public.case_deadlines (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.cases (room_id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  due_date date not null,
  lawyer_id uuid references public.profiles (id) on delete set null, -- 없으면 방의 변호사 전원
  source public.hearing_source not null default 'manual',
  external_id text unique,
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index case_deadlines_room on public.case_deadlines (room_id);
create index case_deadlines_open on public.case_deadlines (due_date) where handled_at is null;

-- 이미 보낸 알림 (만료일이 바뀌면 새 날짜 기준으로 다시)
create table public.deadline_alerts_sent (
  deadline_id uuid not null,
  slot text not null,
  due_date date not null,
  sent_at timestamptz not null default now(),
  primary key (deadline_id, slot, due_date)
);

alter table public.case_deadlines enable row level security;
alter table public.deadline_alerts_sent enable row level security;
-- 의뢰인에게는 보이지 않습니다: 그 사건방의 변호사·직원만
create policy deadlines_read on public.case_deadlines for select to authenticated using (is_firm() and is_member(room_id));
revoke all on public.case_deadlines, public.deadline_alerts_sent from anon, authenticated;
grant select on public.case_deadlines to authenticated;
grant all on public.case_deadlines, public.deadline_alerts_sent to service_role;

-- 불변기간 게시판: 변호사 계정만 (enum 새 값은 같은 작업 안에서 비교할 수 없어 글자로 비교)
create or replace function public.can_see_board(b public.board_kind) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when b = 'anon' then me_role() is not null
    when b::text = 'deadline' or b in ('lawyer', 'advice', 'event', 'praise', 'lawnews') then me_role() = 'lawyer'
    else me_role() in ('lawyer', 'admin')
  end
$$;

-- 자동 글만 올라오는 게시판에는 직접 못 씀
create or replace function public.create_post(p_board public.board_kind, p_title text, p_body text, p_field text default '', p_notice boolean default false, p_attachments jsonb default '[]', p_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; r public.role := me_role(); atts jsonb := coalesce(p_attachments, '[]');
begin
  perform board_guard(p_board);
  if p_board::text in ('lawnews', 'deadline') then raise exception '자동 글만 올라오는 게시판입니다.'; end if;
  if (p_board = 'notice' or (p_board = 'skyzai' and p_notice)) and r <> 'admin' then raise exception '공지는 어드민만 올릴 수 있습니다.'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception '제목과 내용을 입력해 주세요.'; end if;
  if p_board in ('anon', 'lawyer', 'advice', 'praise') and coalesce(p_field, '') = '' then raise exception '분야를 골라 주세요.'; end if;
  if jsonb_array_length(atts) > 5 then raise exception '첨부는 5개까지 올릴 수 있습니다.'; end if;
  if not post_attachments_ok(p_id, atts) then raise exception '첨부를 올릴 수 없습니다.'; end if;
  insert into posts (id, board, author_id, field, title, body, notice, attachments)
  values (p_id, p_board, auth.uid(), coalesce(p_field, ''), trim(p_title), trim(p_body), p_board = 'skyzai' and p_notice, atts)
  returning posts.id into id;
  perform alias_for(id, auth.uid());
  return id;
end $$;

create or replace function public.board_upload_check(p_board public.board_kind) returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform board_guard(p_board);
  if p_board::text in ('lawnews', 'deadline') then raise exception '자동 글만 올라오는 게시판입니다.'; end if;
end $$;

-- 담당 변호사: 지정한 변호사, 없으면 그 사건방의 변호사 전원
create function public.deadline_lawyers(p_room uuid, p_lawyer uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select p_lawyer where p_lawyer is not null
  union
  select m.user_id from room_members m join profiles p on p.id = m.user_id
  where p_lawyer is null and m.room_id = p_room and p.role = 'lawyer' and p.active
$$;

-- 말머리: 담당 변호사의 사무소(지점, 없으면 부서)
create function public.deadline_office(p_room uuid, p_lawyer uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(nullif(trim(p.branch), ''), nullif(trim(p.dept), ''))
    from profiles p where p.id in (select deadline_lawyers(p_room, p_lawyer))
    order by (nullif(trim(p.branch), '') is null), p.nickname limit 1
  ), '미지정')
$$;

-- 사건방의 변호사·직원인지
create function public.deadline_guard(p_room uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_firm() and is_member(p_room)) then
    raise exception '담당 변호사·직원만 불변기간을 관리할 수 있습니다.';
  end if;
  if not exists (select 1 from cases where room_id = p_room) then raise exception '사건방에서만 불변기간을 올릴 수 있습니다.'; end if;
end $$;

create function public.add_deadline(p_id uuid, p_room uuid, p_label text, p_due date, p_lawyer uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform deadline_guard(p_room);
  if coalesce(trim(p_label), '') = '' then raise exception '불변기간 이름을 적어 주세요.'; end if;
  if p_due is null then raise exception '만료일을 적어 주세요.'; end if;
  if p_lawyer is not null and not exists (
    select 1 from room_members m join profiles p on p.id = m.user_id where m.room_id = p_room and m.user_id = p_lawyer and p.role = 'lawyer'
  ) then raise exception '이 사건방의 변호사만 담당으로 지정할 수 있습니다.'; end if;
  insert into case_deadlines (id, room_id, label, due_date, lawyer_id, created_by) values (p_id, p_room, trim(p_label), p_due, p_lawyer, auth.uid());
end $$;

-- 조치 완료 표시 / 취소. 이미 올라간 경고 글 제목에도 표시합니다.
create function public.set_deadline_handled(p_id uuid, p_done boolean) returns void language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  select room_id into r from case_deadlines where id = p_id;
  if r is null then raise exception '불변기간을 찾을 수 없습니다.'; end if;
  perform deadline_guard(r);
  update case_deadlines set handled_at = case when p_done then now() end, handled_by = case when p_done then auth.uid() end where id = p_id;
  update posts set title = case when p_done then title || ' (조치 완료)' else replace(title, ' (조치 완료)', '') end
  where source_id = 'deadline:' || p_id and (title like '% (조치 완료)') <> p_done;
end $$;

create function public.delete_deadline(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare d case_deadlines;
begin
  select * into d from case_deadlines where id = p_id;
  if d.id is null then raise exception '불변기간을 찾을 수 없습니다.'; end if;
  perform deadline_guard(d.room_id);
  if d.source = 'daeryuntop' then raise exception '대륜탑에서 온 불변기간은 대륜탑에서 바꿔 주세요.'; end if;
  delete from case_deadlines where id = p_id;
end $$;

-- 어드민: 대표 계정 지정
create function public.admin_set_executive(p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard_target(p_user);
  if p_on and exists (select 1 from profiles where id = p_user and role = 'client') then raise exception '의뢰인 계정은 대표로 지정할 수 없습니다.'; end if;
  update profiles set is_executive = p_on where id = p_user;
end $$;

-- 어드민: 사건별 알림 켜기·끄기
create function public.admin_set_deadline_alerts(p_room uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 바꿀 수 있습니다.'; end if;
  update cases set deadline_alerts = p_on where room_id = p_room;
  if not found then raise exception '사건을 찾을 수 없습니다.'; end if;
end $$;

-- 어드민: 사건 목록과 불변기간 (어드민은 사건방 참여자가 아니어도 봅니다)
create function public.admin_deadline_cases() returns table (room_id uuid, title text, alerts_on boolean, office text, deadlines jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 볼 수 있습니다.'; end if;
  return query
  select c.room_id, c.title, c.deadline_alerts, deadline_office(c.room_id, null),
    coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'due', d.due_date, 'handledAt', d.handled_at) order by d.due_date)
      from case_deadlines d where d.room_id = c.room_id), '[]')
  from cases c
  order by (select min(d.due_date) from case_deadlines d where d.room_id = c.room_id and d.handled_at is null) nulls last, c.title;
end $$;

-- 예약 작업(1분마다): 때가 된 알림을 쌓고 경고 글을 올립니다.
create function public.enqueue_deadline_alerts(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  today date := (p_now at time zone 'Asia/Seoul')::date;
  r record; n int := 0; k int; office text; names text;
begin
  for r in
    select d.id, d.room_id, d.label, d.due_date, d.lawyer_id, c.title, s.slot
    from case_deadlines d
    join cases c on c.room_id = d.room_id
    cross join lateral (values
      ('d3', (d.due_date - 3) + time '09:00'),
      ('d0', d.due_date + time '00:00'),
      ('over', (d.due_date + 1) + time '00:00')
    ) as s(slot, local_at)
    where c.deadline_alerts and d.handled_at is null
      and d.due_date >= today - 7
      and (s.local_at at time zone 'Asia/Seoul') <= p_now
      -- 3일 전 알림은 그 시각 3시간 안에만 (늦게 등록한 기간에 지난 알림을 보내지 않음)
      and (s.slot <> 'd3' or (s.local_at at time zone 'Asia/Seoul') > p_now - interval '3 hours')
    order by d.due_date, s.slot
  loop
    insert into deadline_alerts_sent (deadline_id, slot, due_date) values (r.id, r.slot, r.due_date) on conflict do nothing;
    get diagnostics k = row_count;
    continue when k = 0;

    insert into push_outbox (user_id, title, body, data)
    select u.id,
      case r.slot when 'd3' then '불변기간 3일 전' when 'd0' then '불변기간 오늘 만료' else '불변기간 도과' end || ' · ' || r.title,
      r.label || ' ' || push_when(r.due_date, null) || case r.slot
        when 'over' then E' 만료\n조치 완료 표시가 없습니다. 바로 확인해 주세요.'
        else E' 24:00 만료\n조치했으면 앱에서 ''조치 완료''를 눌러 주세요.' end,
      jsonb_build_object('kind', 'deadline', 'roomId', r.room_id, 'deadlineId', r.id)
    from profiles u
    where u.active and (u.id in (select deadline_lawyers(r.room_id, r.lawyer_id)) or u.is_executive);
    get diagnostics k = row_count;
    n := n + k;

    if r.slot = 'd0' then
      office := deadline_office(r.room_id, r.lawyer_id);
      select string_agg(p.nickname, ', ' order by p.nickname) into names from profiles p where p.id in (select deadline_lawyers(r.room_id, r.lawyer_id));
      insert into posts (board, author_bot, title, body, source_id)
      values ('deadline', 'bot_deadline',
        '[' || office || '] 불변기간 오늘 만료 · ' || r.title || ' ' || r.label,
        '사건: ' || r.title || E'\n불변기간: ' || r.label || ' · ' || push_when(r.due_date, null) || E' 24:00 만료\n담당 변호사: ' || coalesce(names, '미지정')
          || E'\n\n만료 하루 전 24시까지 조치 완료 표시가 없어 자동으로 올린 글입니다.',
        'deadline:' || r.id)
      on conflict (source_id) do nothing;
    end if;
  end loop;
  return n;
end $$;

-- 대륜탑 연동(서버 함수만): 대륜탑 사건 번호로 사건을 찾아 불변기간을 넣거나 고치거나 지웁니다.
create function public.ingest_daeryuntop_deadline(
  p_external_id text, p_case_ref text, p_label text, p_due date,
  p_lawyer_login text default null, p_handled boolean default null, p_cancelled boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid; l uuid; id uuid;
begin
  select room_id into r from cases where external_ref = p_case_ref;
  if r is null then raise exception 'unknown case %', p_case_ref; end if;
  if p_cancelled then delete from case_deadlines where external_id = p_external_id; return null; end if;
  if p_lawyer_login is not null then select p.id into l from profiles p where p.login_id = lower(p_lawyer_login) and p.role = 'lawyer'; end if;
  insert into case_deadlines (room_id, label, due_date, lawyer_id, source, external_id)
  values (r, p_label, p_due, l, 'daeryuntop', p_external_id)
  on conflict (external_id) do update set label = excluded.label, due_date = excluded.due_date, lawyer_id = coalesce(excluded.lawyer_id, case_deadlines.lawyer_id)
  returning case_deadlines.id into id;
  if p_handled is not null then
    update case_deadlines set handled_at = case when p_handled then coalesce(handled_at, now()) end where case_deadlines.id = id;
  end if;
  return id;
end $$;

revoke execute on function
  public.deadline_lawyers(uuid, uuid), public.deadline_office(uuid, uuid), public.deadline_guard(uuid),
  public.add_deadline(uuid, uuid, text, date, uuid), public.set_deadline_handled(uuid, boolean), public.delete_deadline(uuid),
  public.admin_set_executive(uuid, boolean), public.admin_set_deadline_alerts(uuid, boolean), public.admin_deadline_cases(),
  public.enqueue_deadline_alerts(timestamptz), public.ingest_daeryuntop_deadline(text, text, text, date, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function
  public.add_deadline(uuid, uuid, text, date, uuid), public.set_deadline_handled(uuid, boolean), public.delete_deadline(uuid),
  public.admin_set_executive(uuid, boolean), public.admin_set_deadline_alerts(uuid, boolean), public.admin_deadline_cases()
  to authenticated;
grant execute on function
  public.deadline_lawyers(uuid, uuid), public.deadline_office(uuid, uuid), public.deadline_guard(uuid),
  public.add_deadline(uuid, uuid, text, date, uuid), public.set_deadline_handled(uuid, boolean), public.delete_deadline(uuid),
  public.admin_set_executive(uuid, boolean), public.admin_set_deadline_alerts(uuid, boolean), public.admin_deadline_cases(),
  public.enqueue_deadline_alerts(timestamptz), public.ingest_daeryuntop_deadline(text, text, text, date, text, boolean, boolean)
  to service_role;

-- Supabase에서만: 실시간 알림, 1분 예약 작업에 불변기간 확인 추가
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.case_deadlines;
  end if;
  if to_regnamespace('cron') is not null then
    perform cron.schedule('push-send', '* * * * *', 'select public.enqueue_deadline_alerts(); select public.kick_push()');
  end if;
end $$;
