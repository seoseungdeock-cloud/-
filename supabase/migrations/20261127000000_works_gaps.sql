-- 네이버웍스 대비 보강 10건 (2026-11-27) — 「네이버웍스 API 대비 SKYNET 구현 비교」 보고서 4장 순서대로.
--   1 파일함 휴지통   2 일정 미리 알림·초대 알림   3 필독 30일 상한·안 읽은 사람   4 감사 범위 확대
--   5 반복 요일·회차 예외   6 할 일 담당자 여러 명·완료 조건   7 봇 버튼·1:1   8 파일 외부 링크
--   9 연락처 전화·메일 여러 개·특정 부서 공유   10 조직도 임원·겸직

-- ───────────────────────── 1. 파일함 휴지통 ─────────────────────────
-- 지우면 바로 사라지지 않고 30일 동안 휴지통에 있다가 예약 작업이 지웁니다. 올린 사람·어드민만 휴지통을 보고 되살립니다.
alter table public.drive_files add column if not exists deleted_at timestamptz;
alter table public.drive_files add column if not exists deleted_by uuid references public.profiles (id) on delete set null;
create index if not exists drive_files_trash on public.drive_files (deleted_at) where deleted_at is not null;
create or replace function public.can_see_file(f public.drive_files) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when f.deleted_at is not null then f.uploader_id = auth.uid() or is_admin()
    else f.uploader_id = auth.uid()
      or (f.scope = 'firm' and is_firm())
      or (f.scope = 'dept' and is_firm() and f.dept = my_dept())
      or (f.scope = 'room' and is_member(f.room_id))
  end
$$;
-- 휴지통 비우기 (30일 지난 것). 명찰이 지워지면 drive_file_cleanup 트리거가 저장소 파일도 지움
create or replace function public.purge_drive_trash() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.drive_files where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_drive_trash() from public, anon, authenticated;
grant execute on function public.purge_drive_trash() to service_role;

-- ───────────────────────── 2·5. 일정: 미리 알림 · 비공개 · 반복 요일/간격/예외 · 참석 미정/선택 ─────────────────────────
alter table public.events add column if not exists reminders int[] not null default '{}';          -- 시작 n분 전 (예: {10, 1440})
alter table public.events add column if not exists private boolean not null default false;         -- 비공개: 주인·참석자 외에는 「바쁨」만
alter table public.events add column if not exists recurrence_days smallint[] not null default '{}'; -- 매주 반복 요일 0=일 … 6=토 (비면 시작일 요일)
alter table public.events add column if not exists recurrence_interval int not null default 1 check (recurrence_interval between 1 and 52);
alter table public.events add column if not exists recurrence_exdates date[] not null default '{}'; -- 건너뛸 회차(한국 날짜)
alter type public.attend_status add value if not exists 'tentative';
alter table public.event_attendees add column if not exists optional boolean not null default false;
comment on column public.events.reminders is '시작 몇 분 전에 알릴지 (여러 개)';
comment on column public.events.recurrence_exdates is '반복 중 건너뛰는 회차의 한국 날짜';

/** 일정의 회차 시작 시각들 (범위 안). 반복 아니면 자기 자신 하나. 최대 400회 */
create or replace function public.event_occurrences(e public.events, p_from timestamptz, p_to timestamptz)
returns setof timestamptz language plpgsql stable set search_path = public as $$
declare t timestamptz; k int := 0; d smallint; base timestamptz; wk timestamptz; dur interval;
  kst_day date; until_ts timestamptz;
begin
  if e.recurrence = 'none' then
    if e.starts_at <= p_to and e.ends_at >= p_from then return next e.starts_at; end if;
    return;
  end if;
  dur := e.ends_at - e.starts_at;
  until_ts := case when e.recurrence_until is null then p_to else least(p_to, (e.recurrence_until::timestamp + interval '1 day' - interval '9 hours') at time zone 'UTC') end;
  if e.recurrence = 'weekly' and cardinality(e.recurrence_days) > 0 then
    -- 시작일이 든 주(일요일 시작, 한국 기준)부터 interval 주마다, 지정 요일 각각
    wk := e.starts_at - make_interval(days => extract(dow from e.starts_at at time zone 'Asia/Seoul')::int);
    loop
      foreach d in array e.recurrence_days loop
        t := wk + make_interval(days => d);
        if t >= e.starts_at and t <= until_ts and t + dur >= p_from then
          kst_day := (t at time zone 'Asia/Seoul')::date;
          if not kst_day = any (e.recurrence_exdates) then return next t; end if;
        end if;
      end loop;
      wk := wk + make_interval(weeks => e.recurrence_interval);
      k := k + 1;
      exit when wk > until_ts or k > 400;
    end loop;
    return;
  end if;
  loop
    t := case e.recurrence
      when 'daily' then e.starts_at + make_interval(days => k * e.recurrence_interval)
      when 'weekly' then e.starts_at + make_interval(weeks => k * e.recurrence_interval)
      else e.starts_at + make_interval(months => k * e.recurrence_interval) end;
    exit when t > until_ts or k > 400;
    if t + dur >= p_from then
      kst_day := (t at time zone 'Asia/Seoul')::date;
      if not kst_day = any (e.recurrence_exdates) then return next t; end if;
    end if;
    k := k + 1;
  end loop;
end $$;

-- 미리 알림 보낸 기록 (회차·사람·분 단위로 한 번만)
create table if not exists public.event_reminders_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  occurs_at timestamptz not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  minutes int not null,
  sent_at timestamptz not null default now(),
  primary key (event_id, occurs_at, user_id, minutes)
);
alter table public.event_reminders_sent enable row level security;
grant all on public.event_reminders_sent to service_role;

/** 1분마다: 앞으로 올 회차 중 「시작 n분 전」이 지금인 것을 push_outbox 에 넣음. 받는 사람 = 주인 + 거절하지 않은 참석자 */
create or replace function public.enqueue_event_reminders() returns void language plpgsql security definer set search_path = public as $$
declare e public.events; occ timestamptz; m int; uid uuid; due timestamptz; kst text;
begin
  for e in select * from public.events where cardinality(reminders) > 0 and (recurrence <> 'none' or starts_at > now() - interval '1 day') loop
    for occ in select * from public.event_occurrences(e, now(), now() + interval '31 days') loop
      foreach m in array e.reminders loop
        due := occ - make_interval(mins => m);
        if due <= now() and due > now() - interval '10 minutes' then
          kst := to_char(occ at time zone 'Asia/Seoul', case when e.all_day then 'MM월 DD일' else 'MM월 DD일 HH24:MI' end);
          for uid in select e.owner_id union select a.user_id from public.event_attendees a where a.event_id = e.id and a.status <> 'declined' loop
            if not exists (select 1 from public.event_reminders_sent s where s.event_id = e.id and s.occurs_at = occ and s.user_id = uid and s.minutes = m) then
              insert into public.event_reminders_sent (event_id, occurs_at, user_id, minutes) values (e.id, occ, uid, m);
              insert into public.push_outbox (user_id, title, body, data)
              values (uid, '일정 알림 · ' || e.title,
                      case when m = 0 then '지금 시작합니다' when m < 60 then m || '분 뒤 시작' when m < 1440 then (m / 60) || '시간 뒤 시작' else (m / 1440) || '일 뒤 · ' end || ' ' || kst || coalesce(' · ' || e.place, ''),
                      jsonb_build_object('kind', 'event', 'eventId', e.id, 'at', occ));
            end if;
          end loop;
        end if;
      end loop;
    end loop;
  end loop;
  delete from public.event_reminders_sent where sent_at < now() - interval '60 days';
end $$;
revoke all on function public.enqueue_event_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_event_reminders() to service_role;

-- 참석자로 넣으면 초대 알림, 참석자가 답하면 주인에게 알림
create or replace function public.event_attendee_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare e public.events; who text; kst text;
begin
  select * into e from public.events where id = coalesce(new.event_id, old.event_id);
  if e.id is null then return coalesce(new, old); end if;
  kst := to_char(e.starts_at at time zone 'Asia/Seoul', case when e.all_day then 'MM월 DD일' else 'MM월 DD일 HH24:MI' end);
  if tg_op = 'INSERT' and new.user_id <> e.owner_id then
    select nickname into who from public.profiles where id = e.owner_id;
    insert into public.push_outbox (user_id, title, body, data)
    values (new.user_id, '일정 초대 · ' || e.title, coalesce(who, '') || '님이 초대했습니다 · ' || kst || coalesce(' · ' || e.place, ''), jsonb_build_object('kind', 'event', 'eventId', e.id));
  elsif tg_op = 'UPDATE' and new.status <> old.status and new.user_id <> e.owner_id and new.status <> 'pending' then
    select nickname into who from public.profiles where id = new.user_id;
    insert into public.push_outbox (user_id, title, body, data)
    values (e.owner_id, e.title, coalesce(who, '') || '님이 ' || case new.status when 'accepted' then '참석' when 'declined' then '불참' else '미정' end || '으로 답했습니다', jsonb_build_object('kind', 'event', 'eventId', e.id));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists event_attendees_notify on public.event_attendees;
create trigger event_attendees_notify after insert or update on public.event_attendees for each row execute function public.event_attendee_notify();

-- ───────────────────────── 3. 필독: 30일 상한 · 안 읽은 사람 명단 ─────────────────────────
create or replace function public.create_post(p_board public.board_kind, p_title text, p_body text, p_field text default '', p_notice boolean default false, p_attachments jsonb default '[]', p_id uuid default gen_random_uuid(), p_must_read_until date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; r public.role := me_role(); atts jsonb := coalesce(p_attachments, '[]');
begin
  perform board_guard(p_board);
  if p_board::text in ('lawnews', 'deadline') then raise exception '자동 글만 올라오는 게시판입니다.'; end if;
  if (p_board = 'notice' or (p_board = 'skyzai' and p_notice)) and r <> 'admin' then raise exception '공지는 어드민만 올릴 수 있습니다.'; end if;
  if p_must_read_until is not null and p_board = 'anon' then raise exception '익명 게시판에는 필독을 걸 수 없습니다.'; end if;
  if p_must_read_until is not null and p_must_read_until < (now() at time zone 'Asia/Seoul')::date then raise exception '필독 기한은 오늘 이후여야 합니다.'; end if;
  if p_must_read_until is not null and p_must_read_until > (now() at time zone 'Asia/Seoul')::date + 30 then raise exception '필독 기한은 최대 30일까지입니다.'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception '제목과 내용을 입력해 주세요.'; end if;
  if p_board in ('anon', 'lawyer', 'advice', 'praise') and coalesce(p_field, '') = '' then raise exception '분야를 골라 주세요.'; end if;
  if jsonb_array_length(atts) > 5 then raise exception '첨부는 5개까지 올릴 수 있습니다.'; end if;
  if not post_attachments_ok(p_id, atts) then raise exception '첨부를 올릴 수 없습니다.'; end if;
  insert into posts (id, board, author_id, field, title, body, notice, attachments, must_read_until)
  values (p_id, p_board, auth.uid(), coalesce(p_field, ''), trim(p_title), trim(p_body), p_board = 'skyzai' and p_notice, atts, p_must_read_until)
  returning posts.id into id;
  perform alias_for(id, auth.uid());
  return id;
end $$;
/** 필독 대상자 전체의 읽음 여부 (글쓴이·어드민). 대상 = 그 게시판을 볼 수 있는 재직 구성원 (익명 게시판 제외) */
create or replace function public.post_read_status(p_post uuid)
returns table (user_id uuid, nickname text, dept text, is_read boolean, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from posts p where p.id = p_post and p.board <> 'anon' and (p.author_id = auth.uid() or is_admin())) then
    raise exception '글쓴이와 어드민만 볼 수 있습니다.';
  end if;
  return query
    select pr.id, pr.nickname, pr.dept, (r.user_id is not null), r.read_at
      from profiles pr
      left join post_reads r on r.post_id = p_post and r.user_id = pr.id
     where pr.active and pr.role in ('lawyer', 'admin')
     order by (r.user_id is not null), pr.dept nulls last, pr.nickname;
end $$;
revoke execute on function public.post_read_status(uuid) from public, anon;
grant execute on function public.post_read_status(uuid) to authenticated;

-- ───────────────────────── 4. 감사 범위 확대 ─────────────────────────
-- 로그인, 파일 내려받기(앱이 신고), 일정·할 일·노트·연락처·파일함 변경
create or replace function public.audit_login() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.last_login_at is distinct from old.last_login_at and new.last_login_at is not null then
    perform audit('auth.login', 'user', new.id::text, null, jsonb_build_object('login_id', new.login_id));
  end if;
  return new;
end $$;
drop trigger if exists profiles_audit_login on public.profiles;
create trigger profiles_audit_login after update of last_login_at on public.profiles for each row execute function public.audit_login();
create or replace function public.audit_work() returns trigger language plpgsql security definer set search_path = public as $$
declare kind text := tg_table_name; act text; id text; room uuid; d jsonb := '{}';
begin
  act := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
  if tg_table_name = 'events' then
    id := coalesce(new.id, old.id)::text; room := coalesce(new.room_id, old.room_id); d := jsonb_build_object('title', coalesce(new.title, old.title), 'scope', coalesce(new.scope, old.scope));
  elsif tg_table_name = 'tasks' then
    id := coalesce(new.id, old.id)::text; room := coalesce(new.room_id, old.room_id); d := jsonb_build_object('title', coalesce(new.title, old.title));
    if tg_op = 'UPDATE' and (new.done_at is null) <> (old.done_at is null) then act := case when new.done_at is null then 'reopen' else 'done' end; end if;
  elsif tg_table_name = 'shared_notes' then
    id := coalesce(new.id, old.id)::text; room := coalesce(new.room_id, old.room_id); d := jsonb_build_object('title', coalesce(new.title, old.title), 'scope', coalesce(new.scope, old.scope));
  elsif tg_table_name = 'contacts' then
    id := coalesce(new.id, old.id)::text; d := jsonb_build_object('name', coalesce(new.name, old.name), 'shared', coalesce(new.shared, old.shared));
  elsif tg_table_name = 'drive_files' then
    id := coalesce(new.id, old.id)::text; room := coalesce(new.room_id, old.room_id); d := jsonb_build_object('name', coalesce(new.name, old.name), 'scope', coalesce(new.scope, old.scope), 'folder', coalesce(new.folder, old.folder), 'size', coalesce(new.size, old.size));
    kind := 'file';
    if tg_op = 'UPDATE' then
      if new.deleted_at is not null and old.deleted_at is null then act := 'trash';
      elsif new.deleted_at is null and old.deleted_at is not null then act := 'restore';
      elsif new.name <> old.name or new.folder <> old.folder then act := 'move';
      else return coalesce(new, old); end if;
    elsif tg_op = 'INSERT' then act := 'upload';
    elsif tg_op = 'DELETE' then act := 'purge'; end if;
  end if;
  perform audit(kind || '.' || act, kind, id, room, d);
  return coalesce(new, old);
end $$;
drop trigger if exists events_audit on public.events;
create trigger events_audit after insert or update or delete on public.events for each row execute function public.audit_work();
drop trigger if exists tasks_audit on public.tasks;
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.audit_work();
drop trigger if exists shared_notes_audit on public.shared_notes;
create trigger shared_notes_audit after insert or update or delete on public.shared_notes for each row execute function public.audit_work();
drop trigger if exists contacts_audit on public.contacts;
create trigger contacts_audit after insert or update or delete on public.contacts for each row execute function public.audit_work();
drop trigger if exists drive_files_audit on public.drive_files;
create trigger drive_files_audit after insert or update or delete on public.drive_files for each row execute function public.audit_work();
/** 앱이 파일을 열거나 내려받을 때 신고: kind = 'drive'(파일함) | 'room'(대화 첨부) | 'board'(게시판 첨부) */
create or replace function public.log_file_download(p_kind text, p_path text, p_name text default null, p_room uuid default null)
returns void language sql security definer set search_path = public as $$
  select audit('file.download', 'file', left(coalesce(p_path, ''), 200), p_room, jsonb_build_object('source', p_kind, 'name', p_name))
$$;
revoke execute on function public.log_file_download(text, text, text, uuid) from public, anon;
grant execute on function public.log_file_download(text, text, text, uuid) to authenticated;

-- ───────────────────────── 6. 할 일: 담당자 여러 명 · 완료 조건 ─────────────────────────
create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  done_at timestamptz,
  primary key (task_id, user_id)
);
alter table public.tasks add column if not exists completion text not null default 'any' check (completion in ('any', 'all'));
comment on column public.tasks.completion is 'any = 한 명만 끝내도 완료, all = 모두 끝내야 완료 (네이버웍스 ANY_ONE/MUST_ALL)';
insert into public.task_assignees (task_id, user_id, done_at)
  select id, assignee_id, done_at from public.tasks where assignee_id is not null
  on conflict do nothing;
alter table public.task_assignees enable row level security;
-- 행 규칙이 서로를 부르면 무한 재귀가 나므로 security definer 도우미로 끊음
create or replace function public.task_owner(t uuid) returns uuid language sql stable security definer set search_path = public as $$ select owner_id from public.tasks where id = t $$;
create or replace function public.is_task_assignee(t uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.task_assignees a where a.task_id = t and a.user_id = auth.uid()) $$;
revoke execute on function public.task_owner(uuid), public.is_task_assignee(uuid) from public, anon;
grant execute on function public.task_owner(uuid), public.is_task_assignee(uuid) to authenticated;
create policy task_assignees_read on public.task_assignees for select to authenticated using (user_id = auth.uid() or task_owner(task_id) = auth.uid());
create policy task_assignees_owner on public.task_assignees for all to authenticated using (task_owner(task_id) = auth.uid()) with check (task_owner(task_id) = auth.uid());
create policy task_assignees_self on public.task_assignees for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.task_assignees to authenticated;
-- 담당자이면 할 일도 보임 (기존 assignee_id 외)
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (owner_id = auth.uid() or assignee_id = auth.uid() or is_task_assignee(id));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (owner_id = auth.uid() or assignee_id = auth.uid() or is_task_assignee(id))
  with check (owner_id = (select x.owner_id from public.tasks x where x.id = tasks.id));
-- 담당자가 자기 몫을 끝내면 완료 조건에 따라 할 일 전체 done_at 을 맞춤
create or replace function public.task_assignee_done() returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tasks; total int; done int;
begin
  select * into t from public.tasks where id = coalesce(new.task_id, old.task_id);
  if t.id is null then return coalesce(new, old); end if;
  select count(*), count(done_at) into total, done from public.task_assignees where task_id = t.id;
  if total = 0 then return coalesce(new, old); end if;
  if (t.completion = 'any' and done > 0) or (t.completion = 'all' and done = total) then
    if t.done_at is null then update public.tasks set done_at = now() where id = t.id; end if;
  elsif t.done_at is not null then
    update public.tasks set done_at = null where id = t.id;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists task_assignees_done on public.task_assignees;
create trigger task_assignees_done after insert or update or delete on public.task_assignees for each row execute function public.task_assignee_done();
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.task_assignees;
  end if;
end $$;

-- ───────────────────────── 7. 봇: 버튼 · 1:1 방 ─────────────────────────
alter table public.messages add column if not exists buttons jsonb;                 -- [{label, url}] 최대 3개
alter table public.rooms add column if not exists bot_id uuid references public.bots (id) on delete set null; -- 봇 1:1 방
create index if not exists rooms_bot on public.rooms (bot_id) where bot_id is not null;
comment on column public.messages.buttons is '봇 메시지의 링크 버튼 [{label, url}]';
/** 봇과 사람의 1:1 방 (없으면 만듦). 서버 함수(bot-send)만 부름 */
create or replace function public.bot_direct_room(p_bot uuid, p_user uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; bname text;
begin
  select id into rid from public.rooms where bot_id = p_bot and exists (select 1 from public.room_members m where m.room_id = rooms.id and m.user_id = p_user) limit 1;
  if rid is not null then return rid; end if;
  select name into bname from public.bots where id = p_bot;
  insert into public.rooms (kind, mode, title, bot_id) values ('group', 'private', '🤖 ' || coalesce(bname, '봇'), p_bot) returning id into rid;
  insert into public.room_members (room_id, user_id, is_master) values (rid, p_user, true);
  return rid;
end $$;
revoke all on function public.bot_direct_room(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bot_direct_room(uuid, uuid) to service_role;

-- ───────────────────────── 8. 파일 외부 링크 ─────────────────────────
-- 링크 하나 = 토큰(해시 저장) + 접근 범위(anyone/firm) + 권한(preview/download) + 만료 + 비밀번호(선택). 실제 전달은 서버 함수 drive-link.
create table if not exists public.drive_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.drive_files (id) on delete cascade,
  token_hash text not null unique,
  access text not null default 'anyone' check (access in ('anyone', 'firm')),
  permission text not null default 'download' check (permission in ('preview', 'download')),
  expires_at timestamptz,
  password_hash text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  hits int not null default 0,
  last_hit_at timestamptz,
  revoked_at timestamptz
);
create index if not exists drive_links_file on public.drive_links (file_id);
alter table public.drive_links enable row level security;
create policy drive_links_read on public.drive_links for select to authenticated
  using (created_by = auth.uid() or is_admin() or exists (select 1 from public.drive_files f where f.id = file_id and f.uploader_id = auth.uid()));
create policy drive_links_delete on public.drive_links for delete to authenticated using (created_by = auth.uid() or is_admin());
create policy drive_links_update on public.drive_links for update to authenticated using (created_by = auth.uid() or is_admin()) with check (created_by = (select x.created_by from public.drive_links x where x.id = drive_links.id));
grant select (id, file_id, access, permission, expires_at, created_by, created_at, hits, last_hit_at, revoked_at), update (revoked_at), delete on public.drive_links to authenticated;
grant select (password_hash) on public.drive_links to authenticated; -- 있는지 여부만 앱이 봄 (해시)
/** 링크 만들기: 올린 사람·어드민. 토큰은 한 번만 돌려주고 해시만 남김 */
create or replace function public.create_drive_link(p_file uuid, p_access text default 'anyone', p_permission text default 'download', p_expires_at timestamptz default null, p_password text default null)
returns table (id uuid, token text) language plpgsql security definer set search_path = public, extensions as $$
declare f public.drive_files; tok text; lid uuid;
begin
  select * into f from public.drive_files where drive_files.id = p_file and deleted_at is null;
  if f.id is null then raise exception '파일을 찾을 수 없습니다.'; end if;
  if f.uploader_id <> auth.uid() and not is_admin() then raise exception '올린 사람과 어드민만 링크를 만들 수 있습니다.'; end if;
  if p_expires_at is not null and p_expires_at > now() + interval '90 days' then raise exception '만료는 최대 90일까지입니다.'; end if;
  if p_password is not null and char_length(p_password) not between 4 and 16 then raise exception '비밀번호는 4~16자입니다.'; end if;
  tok := 'skl_' || encode(gen_random_bytes(24), 'hex');
  insert into public.drive_links (file_id, token_hash, access, permission, expires_at, password_hash, created_by)
  values (p_file, encode(digest(tok, 'sha256'), 'hex'), p_access, p_permission, p_expires_at, case when p_password is null then null else crypt(p_password, gen_salt('bf')) end, auth.uid())
  returning drive_links.id into lid;
  perform audit('file.link_create', 'file', p_file::text, f.room_id, jsonb_build_object('name', f.name, 'access', p_access, 'permission', p_permission, 'expires_at', p_expires_at, 'password', p_password is not null));
  return query select lid, tok;
end $$;
revoke execute on function public.create_drive_link(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.create_drive_link(uuid, text, text, timestamptz, text) to authenticated;
/** 토큰으로 링크 풀기 (서버 함수 drive-link 전용). 유효하면 파일 경로를 돌려주고 횟수를 올림 */
create or replace function public.resolve_drive_link(p_token text, p_password text default null, p_firm_user uuid default null)
returns table (file_id uuid, path text, name text, mime text, size bigint, permission text) language plpgsql security definer set search_path = public, extensions as $$
declare l public.drive_links; f public.drive_files;
begin
  select * into l from public.drive_links where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if l.id is null or l.revoked_at is not null then raise exception '없는 링크입니다.'; end if;
  if l.expires_at is not null and l.expires_at < now() then raise exception '만료된 링크입니다.'; end if;
  if l.access = 'firm' and (p_firm_user is null or not exists (select 1 from public.profiles p where p.id = p_firm_user and p.active and p.role <> 'client')) then raise exception '구성원만 열 수 있는 링크입니다.'; end if;
  if l.password_hash is not null and (p_password is null or crypt(p_password, l.password_hash) <> l.password_hash) then raise exception '비밀번호가 다릅니다.'; end if;
  select * into f from public.drive_files where id = l.file_id and deleted_at is null;
  if f.id is null then raise exception '파일이 지워졌습니다.'; end if;
  update public.drive_links set hits = hits + 1, last_hit_at = now() where id = l.id;
  insert into public.audit_log (actor_id, action, target_kind, target_id, room_id, detail)
  values (p_firm_user, 'file.link_open', 'file', f.id::text, f.room_id, jsonb_build_object('name', f.name, 'link', l.id, 'permission', l.permission));
  return query select f.id, f.path, f.name, f.mime, f.size, l.permission;
end $$;
revoke all on function public.resolve_drive_link(text, text, uuid) from public, anon, authenticated;
grant execute on function public.resolve_drive_link(text, text, uuid) to service_role;

-- ───────────────────────── 9. 연락처: 전화·메일 여러 개 · 특정 부서 공유 ─────────────────────────
alter table public.contacts add column if not exists phones jsonb not null default '[]';   -- [{type:'cell'|'work'|'home'|'fax'|'other', value, primary}]
alter table public.contacts add column if not exists emails jsonb not null default '[]';   -- [{value, primary}]
alter table public.contacts add column if not exists share_depts text[] not null default '{}'; -- shared=false 여도 이 부서 사람은 봄
alter table public.contacts add column if not exists co_edit boolean not null default true;  -- 공유 대상이 고칠 수 있나
alter table public.contacts add column if not exists address text check (char_length(address) <= 200);
alter table public.contacts add column if not exists website text check (char_length(website) <= 200);
-- 기존 한 개짜리 값을 목록으로 옮김
update public.contacts set phones = jsonb_build_array(jsonb_build_object('type', 'work', 'value', phone, 'primary', true)) where phone is not null and phones = '[]';
update public.contacts set emails = jsonb_build_array(jsonb_build_object('value', email, 'primary', true)) where email is not null and emails = '[]';
create or replace function public.can_see_contact(c public.contacts) returns boolean language sql stable security definer set search_path = public as $$
  select c.owner_id = auth.uid() or (is_firm() and (c.shared or my_dept() = any (c.share_depts)))
$$;
revoke execute on function public.can_see_contact(public.contacts) from public, anon;
grant execute on function public.can_see_contact(public.contacts) to authenticated;
drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts for select to authenticated using (can_see_contact(contacts));
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated
  using (owner_id = auth.uid() or is_admin() or (co_edit and can_see_contact(contacts)))
  with check (owner_id = (select x.owner_id from public.contacts x where x.id = contacts.id));

-- 앞선 마이그레이션의 같은 실수 고침: 하위 질의 안의 id 가 바깥 행이 아니라 x.id 를 가리켜 「여러 행」 오류가 났음
drop policy if exists drive_update on public.drive_files;
create policy drive_update on public.drive_files for update to authenticated
  using (uploader_id = auth.uid() or is_admin())
  with check (uploader_id = (select x.uploader_id from public.drive_files x where x.id = drive_files.id) and path = (select x.path from public.drive_files x where x.id = drive_files.id));
drop policy if exists notes_update on public.shared_notes;
create policy notes_update on public.shared_notes for update to authenticated
  using (author_id = auth.uid() or is_admin() or (allow_edit and can_see_note(shared_notes)))
  with check (author_id = (select x.author_id from public.shared_notes x where x.id = shared_notes.id));

-- ───────────────────────── 10. 조직도: 임원 · 겸직 ─────────────────────────
alter table public.profiles add column if not exists officer boolean not null default false;   -- 임원 (직급 이름표 기준, 동기화가 채움)
alter table public.profiles add column if not exists extra_depts text[] not null default '{}'; -- 겸직 부서 (조직도에 함께 표시)
comment on column public.profiles.officer is '임원 여부 — 대륜탑 직급이 대표·부대표·의장 등이면 참 (네이버웍스 Level.executive)';
comment on column public.profiles.extra_depts is '겸직 부서. 대륜탑에 원천이 없어 어드민이 손으로 넣음';
grant update (extra_depts) on public.profiles to authenticated;
drop policy if exists profiles_update_admin_org on public.profiles;
create policy profiles_update_admin_org on public.profiles for update to authenticated using (is_admin()) with check (is_admin());

-- ───────────────────────── 예약 작업 ─────────────────────────
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('push-send', '* * * * *', 'select public.enqueue_deadline_alerts(); select public.enqueue_limit_digest(); select public.enqueue_assign_greeting_alerts(); select public.enqueue_event_reminders(); select public.kick_push()');
    perform cron.schedule('drive-trash-purge', '30 18 * * *', 'select public.purge_drive_trash()'); -- 03:30 KST
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.drive_links;
  end if;
end $$;
