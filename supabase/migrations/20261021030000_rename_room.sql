-- 대화방 이름 바꾸기 (승덕 요청 2026-10-21): 방 참여자 누구나, 상담·사건방은 변호사·직원만. 30자까지.
-- '○○님이 방 이름을 바꿨습니다' 안내 메시지는 앱이 post_message로 올립니다.
create function public.rename_room(p_room uuid, p_title text) returns void language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_title, ''));
begin
  if not is_member(p_room) then raise exception '참여 중인 방이 아닙니다.'; end if;
  if char_length(t) = 0 then raise exception '방 이름을 적어 주세요.'; end if;
  if char_length(t) > 30 then raise exception '방 이름은 30자까지 쓸 수 있습니다.'; end if;
  if exists (select 1 from rooms where id = p_room and kind in ('case', 'consult')) and not is_firm() then
    raise exception '상담·사건방 이름은 변호사·직원만 바꿀 수 있습니다.';
  end if;
  update rooms set title = t where id = p_room;
end $$;

revoke execute on function public.rename_room(uuid, text) from public, anon;
grant execute on function public.rename_room(uuid, text) to authenticated;
