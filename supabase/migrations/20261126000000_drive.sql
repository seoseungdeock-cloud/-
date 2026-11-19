-- 파일함 (2026-11-26) — 네이버웍스 Drive API 대응.
--
-- drive_files : 대화 흐름과 상관없이 모아 두는 파일. 범위는 노트와 같이 회사 공용(firm) / 부서(dept) / 대화방(room).
--               folder 는 '소송서식/민사' 처럼 '/' 로 이어 붙인 이름표라서 폴더를 따로 만들 필요가 없습니다.
--               실제 파일은 storage 버킷 'drive' 에 '<파일 id>/<이름>' 으로 들어가고, 이 표의 한 줄이 그 파일의 명찰입니다.
-- 대화방에서 보낸 사진·파일은 이미 messages.attachments(room-files 버킷)에 있으므로 여기 다시 넣지 않고 앱이 모아서 보여 줍니다.
create table public.drive_files (
  id uuid primary key default gen_random_uuid(),
  scope public.event_scope not null default 'dept',
  dept text,
  room_id uuid references public.rooms (id) on delete cascade,
  folder text not null default '' check (char_length(folder) <= 120),
  name text not null check (char_length(name) between 1 and 200),
  size bigint not null default 0 check (size >= 0),
  mime text check (char_length(mime) <= 120),
  path text not null unique check (char_length(path) <= 400),
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope in ('dept', 'firm', 'room')),
  check (scope <> 'dept' or dept is not null),
  check (scope <> 'room' or room_id is not null)
);
create index drive_files_scope on public.drive_files (scope, dept, room_id, folder);
create index drive_files_uploader on public.drive_files (uploader_id);
alter table public.drive_files enable row level security;
create function public.can_see_file(f public.drive_files) returns boolean language sql stable security definer set search_path = public as $$
  select f.uploader_id = auth.uid()
      or (f.scope = 'firm' and is_firm())
      or (f.scope = 'dept' and is_firm() and f.dept = my_dept())
      or (f.scope = 'room' and is_member(f.room_id))
$$;
revoke execute on function public.can_see_file(public.drive_files) from public, anon;
grant execute on function public.can_see_file(public.drive_files) to authenticated;
create policy drive_read on public.drive_files for select to authenticated using (can_see_file(drive_files));
create policy drive_insert on public.drive_files for insert to authenticated
  with check (uploader_id = auth.uid() and is_firm() and (scope <> 'room' or is_member(room_id)) and (scope <> 'dept' or dept = my_dept() or is_admin()));
-- 이름·폴더 바꾸기는 올린 사람과 어드민만. 범위·경로는 못 바꿈 (올린 사람 그대로)
create policy drive_update on public.drive_files for update to authenticated
  using (uploader_id = auth.uid() or is_admin())
  with check (uploader_id = (select uploader_id from public.drive_files x where x.id = id) and path = (select path from public.drive_files x where x.id = id));
create policy drive_delete on public.drive_files for delete to authenticated using (uploader_id = auth.uid() or is_admin());
create trigger drive_files_touch before update on public.drive_files for each row execute function public.touch_task();
-- 저장소 규칙: 명찰(drive_files)이 보이는 사람만 내려받고, 올리기는 '<내가 만든 명찰 id>/...' 경로로만.
create function public.drive_object_visible(obj_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.drive_files f where f.path = obj_name and can_see_file(f))
$$;
create function public.drive_object_mine(obj_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.drive_files f where f.path = obj_name and f.uploader_id = auth.uid())
$$;
revoke execute on function public.drive_object_visible(text), public.drive_object_mine(text) from public, anon;
grant execute on function public.drive_object_visible(text), public.drive_object_mine(text) to authenticated;
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('drive', 'drive', false, 50 * 1024 * 1024)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
    execute $p$create policy drive_files_read on storage.objects for select to authenticated
      using (bucket_id = 'drive' and public.drive_object_visible(name))$p$;
    execute $p$create policy drive_files_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'drive' and public.drive_object_mine(name))$p$;
    execute $p$create policy drive_files_remove on storage.objects for delete to authenticated
      using (bucket_id = 'drive' and (public.drive_object_mine(name) or public.is_admin()))$p$;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.drive_files;
  end if;
end $$;
-- 명찰을 지우면 저장소 파일도 함께 지움 (storage 스키마가 있을 때만)
create function public.drive_file_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'delete from storage.objects where bucket_id = $1 and name = $2' using 'drive', old.path;
  end if;
  return old;
end $$;
create trigger drive_files_cleanup after delete on public.drive_files for each row execute function public.drive_file_cleanup();
grant select, insert, update, delete on public.drive_files to authenticated;
