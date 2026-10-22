-- 배당인사 확인 (승덕 2026-10-22): 배당·재배당 안내가 올라가면 부장변호사가 당일, 늦어도 다음 날까지 의뢰인에게 배당인사를 하고
-- 안내 말풍선에서 '배당인사 완료'를 체크합니다. 체크가 없으면
--   · 다음 날 오전 9시(한국 시간): 부장변호사에게 알림
--   · 다음 날 24시가 지나면: 부장변호사와 대표 계정에 경고 알림, 사건방(변호사·직원만)에 경고 글
-- 확인 상태는 안내 메시지 자체에 남겨, 메시지 바뀐 것만 받기로 모두에게 바로 보입니다.

alter table public.messages
  add column if not exists assign_chief uuid references public.profiles (id) on delete set null,
  add column if not exists assign_chief_name text,
  add column if not exists greeted_at timestamptz,
  add column if not exists greeted_by uuid references public.profiles (id) on delete set null,
  add column if not exists greet_reminded_at timestamptz,
  add column if not exists greet_warned_at timestamptz;

create index if not exists messages_greet_open on public.messages (created_at) where assign_chief_name is not null and greeted_at is null;

drop function if exists public.post_assign_notice(uuid, uuid, text);
create or replace function public.post_assign_notice(p_id uuid, p_room uuid, p_text text, p_chief text default null) returns void language plpgsql security definer set search_path = public as $$
declare v_name text := nullif(trim(regexp_replace(coalesce(p_chief, ''), '\s*변호사$', '')), ''); v_chief uuid;
begin
  if not is_admin() then raise exception '어드민만 배당 안내를 올릴 수 있습니다.'; end if;
  if not exists (select 1 from rooms where id = p_room and kind = 'case') then raise exception '사건방에만 배당 안내를 올릴 수 있습니다.'; end if;
  if p_text !~ '^\[([0-9]{1,2}월 [0-9]{1,2}일 )?(재)?배당 안내\]\n' or char_length(p_text) > 3000 then raise exception '배당 안내 형식이 아닙니다.'; end if;
  -- 부장변호사 계정: 그 방 변호사 중 이름이 같은 사람, 없으면 같은 이름의 변호사 계정이 하나뿐일 때
  if v_name is not null then
    select p.id into v_chief from room_members m join profiles p on p.id = m.user_id
      where m.room_id = p_room and p.active and p.role = 'lawyer' and p.nickname = v_name limit 1;
    if v_chief is null and (select count(*) from profiles where active and role = 'lawyer' and nickname = v_name) = 1 then
      select id into v_chief from profiles where active and role = 'lawyer' and nickname = v_name;
    end if;
  end if;
  insert into messages (id, room_id, sender_kind, kind, text, origin_id, staff_only, assign_chief, assign_chief_name)
  values (p_id, p_room, 'bot', 'bot', p_text, auth.uid(), true, v_chief, v_name);
end $$;
revoke execute on function public.post_assign_notice(uuid, uuid, text, text) from public, anon;
grant execute on function public.post_assign_notice(uuid, uuid, text, text) to authenticated;

-- 부장변호사가 '배당인사 완료' 체크 (부장 계정을 못 찾은 안내는 그 방 변호사 누구나)
create or replace function public.confirm_assign_greeting(p_message uuid) returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select id, room_id, assign_chief, assign_chief_name, greeted_at into m from messages where id = p_message;
  if m.id is null or m.assign_chief_name is null then raise exception '배당 안내가 아닙니다.'; end if;
  if m.assign_chief is not null and m.assign_chief <> auth.uid() then raise exception '부장변호사만 체크할 수 있습니다.'; end if;
  if m.assign_chief is null and not (is_member(m.room_id) and exists (select 1 from profiles where id = auth.uid() and role = 'lawyer')) then
    raise exception '이 사건방 변호사만 체크할 수 있습니다.';
  end if;
  if m.greeted_at is not null then return; end if;
  update messages set greeted_at = now(), greeted_by = auth.uid() where id = p_message;
end $$;
revoke execute on function public.confirm_assign_greeting(uuid) from public, anon;
grant execute on function public.confirm_assign_greeting(uuid) to authenticated;

-- 받을 사람: 부장변호사 (계정을 못 찾았으면 그 방 변호사 전원)
create or replace function public.assign_greeting_targets(p_room uuid, p_chief uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select p_chief where p_chief is not null
  union
  select m.user_id from room_members m join profiles p on p.id = m.user_id where p_chief is null and m.room_id = p_room and p.active and p.role = 'lawyer'
$$;
revoke execute on function public.assign_greeting_targets(uuid, uuid) from public, anon, authenticated;

-- 예약 작업(1분마다)
create or replace function public.enqueue_assign_greeting_alerts(p_now timestamptz default now()) returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; k int; v_day date;
begin
  for r in
    select m.id, m.room_id, m.assign_chief, m.assign_chief_name, m.created_at, m.greet_reminded_at, m.greet_warned_at, rm.title
    from messages m join rooms rm on rm.id = m.room_id
    where m.assign_chief_name is not null and m.greeted_at is null and not m.recalled and m.greet_warned_at is null
      and m.created_at > p_now - interval '14 days'
  loop
    v_day := (r.created_at at time zone 'Asia/Seoul')::date;
    -- 다음 날 24시가 지남: 경고
    if p_now >= ((v_day + 2) + time '00:00') at time zone 'Asia/Seoul' then
      update messages set greet_warned_at = p_now, greet_reminded_at = coalesce(greet_reminded_at, p_now) where id = r.id and greet_warned_at is null;
      get diagnostics k = row_count;
      continue when k = 0;
      insert into push_outbox (user_id, title, body, data)
      select u.id, '배당인사 미확인 경고 · ' || r.title,
        coalesce(r.assign_chief_name || ' 변호사', '부장변호사') || E'님의 배당인사 완료 체크가 기한(배당 다음 날 24시)까지 없습니다.\n사건방 배당 안내에서 확인해 주세요.',
        jsonb_build_object('kind', 'message', 'roomId', r.room_id, 'messageId', r.id)
      from profiles u
      where u.active and (u.id in (select assign_greeting_targets(r.room_id, r.assign_chief)) or u.is_executive);
      get diagnostics k = row_count;
      n := n + k;
      insert into messages (room_id, sender_kind, kind, text, staff_only)
      values (r.room_id, 'bot', 'bot', '[배당인사 미확인] ' || coalesce(r.assign_chief_name || ' 변호사', '부장변호사') || '님의 배당인사 완료 체크가 기한(배당 다음 날 24시)까지 없습니다. 배당 안내에서 확인해 주세요.', true);
    -- 다음 날 오전 9시: 알림
    elsif r.greet_reminded_at is null and p_now >= ((v_day + 1) + time '09:00') at time zone 'Asia/Seoul' then
      update messages set greet_reminded_at = p_now where id = r.id and greet_reminded_at is null;
      get diagnostics k = row_count;
      continue when k = 0;
      insert into push_outbox (user_id, title, body, data)
      select u.id, '배당인사 확인 전 · ' || r.title,
        E'오늘 24시까지 의뢰인께 배당인사를 하고 배당 안내에서 ''배당인사 완료''를 눌러 주세요.',
        jsonb_build_object('kind', 'message', 'roomId', r.room_id, 'messageId', r.id)
      from profiles u
      where u.active and u.id in (select assign_greeting_targets(r.room_id, r.assign_chief));
      get diagnostics k = row_count;
      n := n + k;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.enqueue_assign_greeting_alerts(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_assign_greeting_alerts(timestamptz) to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('push-send', '* * * * *', 'select public.enqueue_deadline_alerts(); select public.enqueue_limit_digest(); select public.enqueue_assign_greeting_alerts(); select public.kick_push()');
  end if;
end $$;
