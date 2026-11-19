-- 캘린더 일정 · 회의실 예약 · 할 일 (2026-11-20) — 네이버웍스에서 쓰던 기능을 옮겨 옵니다.
--
-- events          : 손으로 넣는 일정. 범위(scope)는 내 일정 / 부서 공유 / 회사 공유 / 대화방 일정. 회의실(resource)을 걸 수 있음.
-- event_attendees : 참석자와 응답(참석·불참·미정).
-- resources       : 회의실 같은 공용 설비 (어드민이 관리).
-- tasks           : 할 일. 만든 사람과 담당자, 기한, 완료.
-- task_categories : 개인 카테고리.

create type public.event_scope as enum ('personal', 'dept', 'firm', 'room');
create type public.attend_status as enum ('pending', 'accepted', 'declined');
create type public.recurrence as enum ('none', 'daily', 'weekly', 'monthly');

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'room' check (kind in ('room', 'equipment')),
  branch text,
  capacity int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  place text,
  memo text check (char_length(memo) <= 2000),
  scope public.event_scope not null default 'personal',
  dept text,
  room_id uuid references public.rooms (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete set null,
  recurrence public.recurrence not null default 'none',
  recurrence_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  check (scope <> 'dept' or dept is not null),
  check (scope <> 'room' or room_id is not null)
);
create index events_time on public.events (starts_at, ends_at);
create index events_owner on public.events (owner_id);
create index events_room on public.events (room_id);
create index events_resource on public.events (resource_id) where resource_id is not null;

create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.attend_status not null default 'pending',
  primary key (event_id, user_id)
);

create table public.task_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort int not null default 0
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  assignee_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  detail text check (char_length(detail) <= 4000),
  due_date date,
  due_time time,
  priority smallint not null default 0 check (priority between 0 and 2),
  category_id uuid references public.task_categories (id) on delete set null,
  room_id uuid references public.rooms (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_owner on public.tasks (owner_id);
create index tasks_assignee on public.tasks (assignee_id);
create index tasks_due on public.tasks (due_date);

-- ---- 보안 규칙 ----
alter table public.resources enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.task_categories enable row level security;
alter table public.tasks enable row level security;

-- 회의실: 구성원은 보고, 어드민만 바꿈
create policy resources_read on public.resources for select to authenticated using (is_firm());
create policy resources_admin on public.resources for all to authenticated using (is_admin()) with check (is_admin());

/** 내 부서 */
create function public.my_dept() returns text language sql stable security definer set search_path = public as $$
  select dept from public.profiles where id = auth.uid()
$$;

/** 이 일정을 볼 수 있나: 주인 · 참석자 · 범위(부서/회사/방) 안의 사람 */
create function public.can_see_event(e public.events) returns boolean language sql stable security definer set search_path = public as $$
  select e.owner_id = auth.uid()
      or exists (select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = auth.uid())
      or (e.scope = 'firm' and is_firm())
      or (e.scope = 'dept' and is_firm() and e.dept = my_dept())
      or (e.scope = 'room' and is_member(e.room_id))
$$;

create policy events_read on public.events for select to authenticated using (can_see_event(events));
create policy events_insert on public.events for insert to authenticated
  with check (owner_id = auth.uid() and (scope <> 'room' or is_member(room_id)) and (scope not in ('dept', 'firm') or is_firm()));
create policy events_update on public.events for update to authenticated using (owner_id = auth.uid() or is_admin()) with check (owner_id = auth.uid() or is_admin());
create policy events_delete on public.events for delete to authenticated using (owner_id = auth.uid() or is_admin());

create policy attendees_read on public.event_attendees for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and can_see_event(e)));
create policy attendees_owner on public.event_attendees for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and (e.owner_id = auth.uid() or is_admin())))
  with check (exists (select 1 from public.events e where e.id = event_id and (e.owner_id = auth.uid() or is_admin())));
create policy attendees_respond on public.event_attendees for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy task_categories_mine on public.task_categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_read on public.tasks for select to authenticated using (owner_id = auth.uid() or assignee_id = auth.uid());
create policy tasks_insert on public.tasks for insert to authenticated with check (owner_id = auth.uid());
create policy tasks_update on public.tasks for update to authenticated using (owner_id = auth.uid() or assignee_id = auth.uid()) with check (owner_id = auth.uid() or assignee_id = auth.uid());
create policy tasks_delete on public.tasks for delete to authenticated using (owner_id = auth.uid());

-- 회의실 겹침 확인 (같은 회의실에 시간이 겹치는 다른 일정이 있으면 그 일정 제목). 반복 일정은 첫 회차 기준.
create function public.resource_conflict(p_resource uuid, p_start timestamptz, p_end timestamptz, p_except uuid default null)
returns table (id uuid, title text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at, e.ends_at from public.events e
   where e.resource_id = p_resource and (p_except is null or e.id <> p_except)
     and e.starts_at < p_end and e.ends_at > p_start
   order by e.starts_at limit 5
$$;
grant execute on function public.resource_conflict(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- 겹치는 회의실 예약은 DB 에서도 막습니다 (화면 확인을 우회해도)
create function public.events_no_double_booking() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resource_id is not null and exists (
    select 1 from public.events e where e.resource_id = new.resource_id and e.id <> new.id and e.starts_at < new.ends_at and e.ends_at > new.starts_at
  ) then
    raise exception '이미 예약된 회의실입니다' using errcode = '23P01';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger events_no_double_booking before insert or update on public.events for each row execute function public.events_no_double_booking();

create function public.touch_task() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_task();

-- 실시간
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.events, public.event_attendees, public.tasks, public.resources;
  end if;
end $$;

-- 기본 회의실 (샘플 — 어드민이 백오피스에서 고침)
insert into public.resources (name, kind, branch, capacity) values
  ('본사 대회의실', 'room', '본사(여의도)', 20),
  ('본사 소회의실 A', 'room', '본사(여의도)', 6),
  ('본사 소회의실 B', 'room', '본사(여의도)', 6),
  ('서초 회의실', 'room', '서울서초', 8),
  ('부산 회의실', 'room', '부산', 10);
