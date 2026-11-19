-- 노트 · 고객/거래처 연락처 (2026-11-23) — 네이버웍스 Note API · Contact API 대응.
--
-- shared_notes : 부서/회사/대화방이 함께 보는 메모. 공지로 고정할 수 있고, '다른 사람 편집 허용'을 켜면 같은 범위 사람이 고칠 수 있음.
-- contacts     : 고객·거래처 연락처. 만든 사람 것이 기본이고 shared=true 면 회사 공용. 태그로 분류.

create table public.shared_notes (
  id uuid primary key default gen_random_uuid(),
  scope public.event_scope not null default 'dept',
  dept text,
  room_id uuid references public.rooms (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 20000),
  pinned boolean not null default false,
  allow_edit boolean not null default true,
  author_id uuid not null references public.profiles (id) on delete cascade,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope in ('dept', 'firm', 'room')),
  check (scope <> 'dept' or dept is not null),
  check (scope <> 'room' or room_id is not null)
);
create index shared_notes_scope on public.shared_notes (scope, dept, room_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  shared boolean not null default false,
  name text not null check (char_length(name) between 1 and 60),
  company text check (char_length(company) <= 80),
  title text check (char_length(title) <= 60),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 120),
  memo text check (char_length(memo) <= 2000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_owner on public.contacts (owner_id);
create index contacts_shared on public.contacts (shared) where shared;

alter table public.shared_notes enable row level security;
alter table public.contacts enable row level security;

create function public.can_see_note(n public.shared_notes) returns boolean language sql stable security definer set search_path = public as $$
  select n.author_id = auth.uid()
      or (n.scope = 'firm' and is_firm())
      or (n.scope = 'dept' and is_firm() and n.dept = my_dept())
      or (n.scope = 'room' and is_member(n.room_id))
$$;
revoke execute on function public.can_see_note(public.shared_notes) from public, anon;

create policy notes_read on public.shared_notes for select to authenticated using (can_see_note(shared_notes));
create policy notes_insert on public.shared_notes for insert to authenticated
  with check (author_id = auth.uid() and is_firm() and (scope <> 'room' or is_member(room_id)) and (scope <> 'dept' or dept = my_dept() or is_admin()));
create policy notes_update on public.shared_notes for update to authenticated
  using (author_id = auth.uid() or is_admin() or (allow_edit and can_see_note(shared_notes)))
  with check (author_id = (select author_id from public.shared_notes x where x.id = id));
create policy notes_delete on public.shared_notes for delete to authenticated using (author_id = auth.uid() or is_admin());

create function public.touch_note() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger shared_notes_touch before update on public.shared_notes for each row execute function public.touch_note();

create policy contacts_read on public.contacts for select to authenticated using (owner_id = auth.uid() or (shared and is_firm()));
create policy contacts_insert on public.contacts for insert to authenticated with check (owner_id = auth.uid() and is_firm());
create policy contacts_update on public.contacts for update to authenticated using (owner_id = auth.uid() or (shared and is_firm())) with check (owner_id = (select owner_id from public.contacts x where x.id = id));
create policy contacts_delete on public.contacts for delete to authenticated using (owner_id = auth.uid() or is_admin());
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_task();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shared_notes, public.contacts;
  end if;
end $$;
