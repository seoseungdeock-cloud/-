-- 1:1 방 이름 (2026-11-28) — SKYZAI 다리(skyzai_open_direct)가 이름 없이 만든 1:1 방이 '새 대화' 로 남던 것.
-- 1:1 방은 상대 이름이 제목이어야 하므로 create_room 이 비어 있으면 상대 닉네임을 넣고, 이미 '새 대화' 인 방도 고칩니다.
-- (앱은 어차피 1:1 방 제목을 상대 이름으로 그리지만, SKYZAI 등 다른 화면이 저장된 제목을 쓰므로 DB 도 맞춤)
create or replace function public.create_room(p_id uuid, p_kind public.room_kind, p_mode public.room_mode, p_title text, p_members uuid[]) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.role := me_role(); others uuid[]; t text;
begin
  if r is null then raise exception '다시 로그인해 주세요.'; end if;
  if p_kind in ('consult', 'case') then raise exception '상담·사건방은 찾기에서 엽니다.'; end if;
  if p_kind in ('meeting', 'marketing') and p_mode <> 'ai' then raise exception '이 방은 AI 참여방으로만 만들 수 있습니다.'; end if;
  if p_kind in ('office', 'meeting', 'marketing') and r = 'client' then raise exception '업무용 방은 로펌 구성원만 만들 수 있습니다.'; end if;
  if p_kind in ('meeting', 'marketing') and not can_use_agents() then raise exception '에이전트 방은 어드민이 허용한 사용자만 만들 수 있습니다.'; end if;
  select coalesce(array_agg(distinct u), '{}') into others from unnest(coalesce(p_members, '{}')) u where u <> auth.uid();
  if p_kind = 'direct' and cardinality(others) <> 1 then raise exception '1:1 대화는 상대 한 명을 골라 주세요.'; end if;
  if exists (select 1 from unnest(others) u where not can_see_profile(u)) then raise exception '초대할 수 없는 사람이 있습니다.'; end if;
  -- 1:1 방은 제목을 비워 보내면 상대 이름으로 (SKYZAI 다리가 그렇게 만듦)
  if p_kind = 'direct' and coalesce(nullif(trim(p_title), ''), '새 대화') = '새 대화' then select nickname into t from profiles where id = others[1]; else t := nullif(trim(p_title), ''); end if;
  insert into rooms (id, kind, mode, title, created_by) values (p_id, p_kind, p_mode, coalesce(t, '새 대화'), auth.uid());
  insert into room_members (room_id, user_id, is_master, joined_at) values (p_id, auth.uid(), true, now());
  insert into room_members (room_id, user_id, joined_at)
  select p_id, u, now() + make_interval(secs => o / 1e6) from unnest(others) with ordinality as x(u, o);
  return p_id;
end $$;
-- 이미 만들어진 1:1 방: 제목을 (만든 사람이 아닌) 상대 이름으로
update public.rooms r set title = p.nickname
  from public.room_members m join public.profiles p on p.id = m.user_id
 where r.kind = 'direct' and m.room_id = r.id and m.user_id <> coalesce(r.created_by, '00000000-0000-0000-0000-000000000000')
   and (r.title = '새 대화' or r.title = '');
