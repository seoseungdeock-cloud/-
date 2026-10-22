-- 대화방 사진 (승덕 2026-10-22): 그 방의 마스터만 바꿉니다. 파일은 room-files 저장소의 '방 id/_photo/…' (참여자만 봄).
alter table public.rooms add column if not exists photo_path text;

create or replace function public.set_room_photo(p_room uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_room_master(p_room) then raise exception '마스터만 방 사진을 바꿀 수 있습니다.'; end if;
  if p_path is not null and p_path !~ ('^' || p_room::text || '/_photo/[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$') then
    raise exception '방 사진 경로가 올바르지 않습니다.';
  end if;
  update rooms set photo_path = p_path where id = p_room;
end $$;

revoke execute on function public.set_room_photo(uuid, text) from public, anon;
grant execute on function public.set_room_photo(uuid, text) to authenticated;
