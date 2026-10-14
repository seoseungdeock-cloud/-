-- 기일 푸시 문구에 사건명과 법원 장소를 넣습니다 (승덕 결정 2026-10-14).
-- 제목: '새 기일 · 사건명', 본문: '변론기일 11월 19일(목) 10:00' + 장소 줄.

create function public.push_case_title(p_head text, p_room uuid) returns text language sql stable set search_path = public as $$
  select p_head || coalesce(' · ' || (select title from cases where room_id = p_room), '')
$$;

create or replace function public.queue_hearing_push() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into push_outbox (user_id, title, body, data)
  select n.user_id,
    push_case_title(case a.change when 'new' then '새 기일' when 'changed' then '기일 변경' else '기일 취소' end, a.room_id),
    a.label || ' ' || case
      when a.change = 'changed' and a.prev_date is not null then push_when(a.prev_date, a.prev_time) || ' → ' || push_when(a.date, a.time)
      when a.change = 'cancelled' then push_when(a.date, a.time) || ' (취소)'
      else push_when(a.date, a.time) end
      || case when a.change <> 'cancelled' and a.place is not null then E'\n' || a.place else '' end
      || E'\n앱에서 확인해 주세요.',
    jsonb_build_object('kind', 'hearing', 'roomId', a.room_id, 'alertId', a.id)
  from new_rows n join hearing_alerts a on a.id = n.alert_id
  where n.acked_at is null;
  if found then perform kick_push(); end if;
  return null;
end $$;

create or replace function public.remind_hearing(p_alert uuid) returns int language plpgsql security definer set search_path = public as $$
declare a hearing_alerts; n int;
begin
  select * into a from hearing_alerts where id = p_alert;
  if a.id is null or not exists (select 1 from hearing_alert_recipients where alert_id = p_alert and user_id = auth.uid()) then
    raise exception '알람을 찾을 수 없습니다.';
  end if;
  if not (is_firm() and is_member(a.room_id)) then raise exception '담당 변호사·직원만 다시 알릴 수 있습니다.'; end if;
  if a.reminded_at > now() - interval '10 minutes' then raise exception '방금 다시 알렸습니다. 10분 뒤에 다시 해 주세요.'; end if;
  update hearing_alerts set reminded_at = now() where id = p_alert;
  insert into push_outbox (user_id, title, body, data)
  select r.user_id, push_case_title('기일 알람 확인 요청', a.room_id),
    a.label || ' ' || push_when(a.date, a.time) || case when a.change <> 'cancelled' and a.place is not null then E'\n' || a.place else '' end
      || E'\n앱에서 확인해 주세요.',
    jsonb_build_object('kind', 'hearing', 'roomId', a.room_id, 'alertId', a.id)
  from hearing_alert_recipients r where r.alert_id = p_alert and r.acked_at is null;
  get diagnostics n = row_count;
  if n > 0 then perform kick_push(); end if;
  return n;
end $$;

create or replace function public.enqueue_hearing_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    select h.id, h.room_id, h.label, h.date, h.time, h.place, s.slot, s.title
    from hearings h
    cross join lateral (values
      ('d7', '기일 7일 전', (h.date - 7) + time '09:00'),
      ('d1', '내일 기일', (h.date - 1) + time '09:00'),
      ('d0', '오늘 기일', h.date + time '08:00')
    ) as s(slot, title, local_at)
    where (s.local_at at time zone 'Asia/Seoul') <= p_now
      and (s.local_at at time zone 'Asia/Seoul') > p_now - interval '3 hours'
      and not exists (select 1 from hearing_reminders_sent x where x.hearing_id = h.id and x.slot = s.slot and x.date = h.date)
  ), marked as (
    insert into hearing_reminders_sent (hearing_id, slot, date) select id, slot, date from due
    on conflict do nothing returning hearing_id, slot
  )
  insert into push_outbox (user_id, title, body, data)
  select m.user_id, push_case_title(d.title, d.room_id),
    d.label || ' ' || push_when(d.date, d.time) || coalesce(E'\n' || d.place, ''),
    jsonb_build_object('kind', 'reminder', 'roomId', d.room_id, 'hearingId', d.id)
  from due d join marked k on k.hearing_id = d.id and k.slot = d.slot
  join room_members m on m.room_id = d.room_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.push_case_title(text, uuid) from public, anon, authenticated;
grant execute on function public.push_case_title(text, uuid) to service_role;
