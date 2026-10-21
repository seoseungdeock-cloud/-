-- 대화방 이름 바꾸기 (승덕 요청 2026-10-21): 그 방의 마스터만, 30자까지. 바꿨다는 안내 메시지는 남기지 않습니다.
create function public.rename_room(p_room uuid, p_title text) returns void language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_title, ''));
begin
  if not is_room_master(p_room) then raise exception '마스터만 방 이름을 바꿀 수 있습니다.'; end if;
  if char_length(t) = 0 then raise exception '방 이름을 적어 주세요.'; end if;
  if char_length(t) > 30 then raise exception '방 이름은 30자까지 쓸 수 있습니다.'; end if;
  update rooms set title = t where id = p_room;
end $$;

revoke execute on function public.rename_room(uuid, text) from public, anon;
grant execute on function public.rename_room(uuid, text) to authenticated;
