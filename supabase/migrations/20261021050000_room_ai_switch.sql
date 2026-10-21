-- 대화방 'AI 참여' 스위치 (승덕 요청 2026-10-21): 어드민만, 그 방 참여자일 때.
-- 사건방·상담방(실제 사건)은 처리위탁·국외이전 안내 전까지 켤 수 없습니다. 바꾸면 방에 안내를 남깁니다(앱이 보냄).
create function public.set_room_ai(p_room uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
declare k public.room_kind;
begin
  if not is_admin() then raise exception '어드민만 AI 참여를 바꿀 수 있습니다.'; end if;
  if not is_member(p_room) then raise exception '참여 중인 방이 아닙니다.'; end if;
  select kind into k from rooms where id = p_room;
  if p_on and k in ('case', 'consult') then raise exception '사건방·상담방은 AI 참여를 켤 수 없습니다.'; end if;
  update rooms set mode = case when p_on then 'ai'::public.room_mode else 'private'::public.room_mode end where id = p_room;
end $$;

revoke execute on function public.set_room_ai(uuid, boolean) from public, anon;
grant execute on function public.set_room_ai(uuid, boolean) to authenticated;
