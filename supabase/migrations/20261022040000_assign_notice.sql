-- 배당·재배당 안내 (승덕 2026-10-22): 어드민이 배당표에서 고른 사건방에 '배당 안내' 봇 메시지를 올립니다.
-- 어드민이 그 방 참여자가 아니어도 올릴 수 있고, 사건방(kind case)에만, 정해진 머리글('[배당 안내]', '[6월 18일 재배당 안내]')로 시작하는 글만.
-- 안내는 변호사·직원용 지침이라 같은 방의 의뢰인에게는 내려가지 않습니다(staff_only: 읽기 정책·푸시에서 뺌).

alter table public.messages add column if not exists staff_only boolean not null default false;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (
  is_member(room_id) and (not staff_only or not exists (select 1 from profiles where id = auth.uid() and role = 'client'))
);

create or replace function public.post_assign_notice(p_id uuid, p_room uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 배당 안내를 올릴 수 있습니다.'; end if;
  if not exists (select 1 from rooms where id = p_room and kind = 'case') then raise exception '사건방에만 배당 안내를 올릴 수 있습니다.'; end if;
  if p_text !~ '^\[([0-9]{1,2}월 [0-9]{1,2}일 )?(재)?배당 안내\]\n' or char_length(p_text) > 3000 then raise exception '배당 안내 형식이 아닙니다.'; end if;
  insert into messages (id, room_id, sender_kind, kind, text, origin_id, staff_only) values (p_id, p_room, 'bot', 'bot', p_text, auth.uid(), true);
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

-- 새 메시지 푸시: 의뢰인에게는 staff_only 메시지를 보내지 않음 (나머지는 20261014140000과 같음)
create or replace function public.queue_message_push() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into push_outbox (user_id, title, body, data)
  select rm.user_id,
    case
      when r.kind = 'direct' and n.sender_kind = 'user' then coalesce(p.nickname, r.title)
      when n.sender_kind = 'user' then r.title
      else r.title
    end
    || case when rm.user_id::text = any (n.mentions) or 'all' = any (n.mentions) then ' (@멘션)' else '' end,
    case
      when r.kind <> 'direct' and n.sender_kind = 'user' then coalesce(p.nickname, '') || ': '
      when n.sender_kind = 'ai' then 'AI: '
      when n.sender_kind = 'bot' then '알림: '
      else ''
    end || message_push_body(n),
    jsonb_build_object('kind', 'message', 'roomId', n.room_id, 'messageId', n.id)
  from new_rows n
  join rooms r on r.id = n.room_id
  left join profiles p on p.id = n.sender_id
  join room_members rm on rm.room_id = n.room_id
  where n.kind <> 'system' and n.hearing_alert_id is null and not n.recalled
    and rm.user_id is distinct from coalesce(n.sender_id, n.origin_id)
    and not (n.staff_only and exists (select 1 from profiles cp where cp.id = rm.user_id and cp.role = 'client'))
    and (rm.notify = 'all' or (rm.notify = 'mention' and (rm.user_id::text = any (n.mentions) or 'all' = any (n.mentions))));
  if found then perform kick_push(); end if;
  return null;
end $$;
