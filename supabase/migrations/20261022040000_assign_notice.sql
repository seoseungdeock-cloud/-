-- 배당·재배당 안내 (승덕 2026-10-22): 어드민이 배당표에서 고른 사건방에 '배당 안내' 봇 메시지를 올립니다.
-- 어드민이 그 방 참여자가 아니어도 올릴 수 있고, 사건방(kind case)에만, 정해진 머리글로 시작하는 글만.
create or replace function public.post_assign_notice(p_id uuid, p_room uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 배당 안내를 올릴 수 있습니다.'; end if;
  if not exists (select 1 from rooms where id = p_room and kind = 'case') then raise exception '사건방에만 배당 안내를 올릴 수 있습니다.'; end if;
  if p_text !~ '^\[(재)?배당 안내\] ' or char_length(p_text) > 1000 then raise exception '배당 안내 형식이 아닙니다.'; end if;
  insert into messages (id, room_id, sender_kind, kind, text, origin_id) values (p_id, p_room, 'bot', 'bot', p_text, auth.uid());
end $$;

revoke execute on function public.post_assign_notice(uuid, uuid, text) from public, anon;
grant execute on function public.post_assign_notice(uuid, uuid, text) to authenticated;

-- 배당표와 맞춰 볼 사건방 목록 (어드민만): 방 id·이름·의뢰인 이름. 어드민이 들어가 있지 않은 방도 포함.
create or replace function public.assign_case_rooms() returns table (id uuid, title text, clients text[]) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 볼 수 있습니다.'; end if;
  return query
    select r.id, r.title, coalesce(array_agg(p.nickname) filter (where p.id is not null), '{}')
    from rooms r
    left join room_members m on m.room_id = r.id
    left join profiles p on p.id = m.user_id and p.role = 'client'
    where r.kind = 'case'
    group by r.id, r.title;
end $$;

revoke execute on function public.assign_case_rooms() from public, anon;
grant execute on function public.assign_case_rooms() to authenticated;
