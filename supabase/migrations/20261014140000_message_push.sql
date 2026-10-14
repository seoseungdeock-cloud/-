-- 새 메시지 푸시 (메신저).
-- 사람·봇·AI 메시지가 올라오면 보낸 사람을 뺀 방 참여자 폰으로 보냅니다.
-- 알림 설정: '모두'는 전부, '멘션만'은 나를(또는 @전체를) 부른 메시지만, '끄기'는 보내지 않음.
-- 시스템 안내('~님이 확인했습니다' 등)와 기일 알람 카드는 보내지 않습니다(기일은 기일 푸시가 따로 감).

create function public.message_push_body(m public.messages) returns text language sql stable set search_path = public as $$
  select case
    when m.kind = 'contact' then '연락처를 보냈습니다.'
    when jsonb_array_length(m.attachments) > 0 and coalesce(trim(m.text), '') = '' then
      case when not exists (select 1 from jsonb_array_elements(m.attachments) a where a ->> 'kind' <> 'image')
        then '사진 ' || jsonb_array_length(m.attachments) || '장'
        else '파일 ' || jsonb_array_length(m.attachments) || '개' end
    when m.forward_of is not null then '[전달] ' || left(coalesce(m.forward_of ->> 'text', ''), 120)
    when m.bundle is not null then '[전달] 대화 묶음'
    else left(m.text, 160)
  end
$$;

create function public.queue_message_push() returns trigger language plpgsql security definer set search_path = public as $$
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
    and (rm.notify = 'all' or (rm.notify = 'mention' and (rm.user_id::text = any (n.mentions) or 'all' = any (n.mentions))));
  if found then perform kick_push(); end if;
  return null;
end $$;
create trigger message_push after insert on public.messages
  referencing new table as new_rows for each statement execute function public.queue_message_push();

revoke execute on function public.message_push_body(public.messages), public.queue_message_push() from public, anon, authenticated;
