-- 대륜탑 기일 연동 (승덕 요청 2026-10-21, 대륜탑 기일관리 화면 기준)
-- 대륜탑의 기일 한 줄을 받아 라잇나우 알림으로 바꿉니다.
--   공식 일정만 받습니다 (개인 일정 ◇ 은 건너뜀).
--   특이사항 '불변'  → 불변기간 (case_deadlines: 3일 전, 하루 전 24시 경고 글, 도과 알림). '완료' = 조치 완료.
--   그 밖의 기일      → 사건방 기일 알람 (새 기일 / 기일 변경 / 기일 취소 카드와 푸시, 7일 전·전날·당일 미리 알림).
--   '엄수'            → 기일 이름에 [엄수]를 붙이고 3일 전 미리 알림을 더 보냅니다.
--   '추정', '부진행', '기일소거', 삭제 → 기일 취소 알림.  '완료' 기일은 새 알림 없이 둡니다.
--   기일 대상자 '확인용'·'상대측' → 의뢰인에게는 보이지 않고 그 사건방의 변호사·직원에게만 푸시합니다.
-- 사건은 앱 사건의 대륜탑 사건번호(cases.case_no) 또는 대륜탑 사건 고유번호(cases.external_ref)로 찾습니다.
-- 대륜탑 API가 생기면 서버 함수 daeryuntop-hearing이, 그 전에는 어드민의 '엑셀 올리기'가 같은 함수를 부릅니다.

alter table public.cases add column case_no text;
create unique index cases_case_no on public.cases (case_no) where case_no is not null;

alter table public.hearings add column external_id text unique;
alter table public.hearings add column firm_only boolean not null default false;
alter table public.hearings add column strict boolean not null default false;

drop policy hearings_read on public.hearings;
create policy hearings_read on public.hearings for select to authenticated using (is_member(room_id) and (not firm_only or is_firm()));

-- 미리 알림: 엄수는 3일 전 오전 9시를 더하고, 변호사·직원 전용 기일은 의뢰인에게 보내지 않습니다.
create or replace function public.enqueue_hearing_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    select h.id, h.room_id, h.label, h.date, h.time, h.place, h.firm_only, s.slot, s.title
    from hearings h
    cross join lateral (values
      ('d7', '기일 7일 전', (h.date - 7) + time '09:00'),
      ('d3', '엄수 기일 3일 전', (h.date - 3) + time '09:00'),
      ('d1', '내일 기일', (h.date - 1) + time '09:00'),
      ('d0', '오늘 기일', h.date + time '08:00')
    ) as s(slot, title, local_at)
    where (s.slot <> 'd3' or h.strict)
      and (s.local_at at time zone 'Asia/Seoul') <= p_now
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
  join room_members m on m.room_id = d.room_id
  join profiles p on p.id = m.user_id
  where not d.firm_only or p.role <> 'client';
  get diagnostics n = row_count;
  return n;
end $$;

-- 대륜탑 기일 한 줄 받기 (서버 함수와 어드민 엑셀 올리기만). 결과: new / changed / cancelled / deadline / same / skip:이유
--   p: { id, caseNo?, caseRef?, official?, party?, name, detail?, date, time?, court?, place?, flags?[], deleted? }
create function public.ingest_daeryuntop_hearing(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  ext text := nullif(trim(p->>'id'), '');
  -- 특이사항: ["불변","완료"] 또는 대륜탑 목록 글자 그대로 '불변·완료'
  flags text[] := case jsonb_typeof(p->'flags')
    when 'array' then coalesce((select array_agg(trim(f)) from jsonb_array_elements_text(p->'flags') f), '{}')
    when 'string' then regexp_split_to_array(trim(p->>'flags'), '\s*[·,/]\s*')
    else '{}' end;
  r uuid; prev hearings; d date; t time; v_place text; lbl text;
  v_firm_only boolean := coalesce(p->>'party', '우리측') in ('확인용', '상대측') or coalesce(p->>'name', '') like '(확인용)%';
  v_strict boolean := '엄수' = any (flags);
  gone text; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if ext is null then return 'skip:기일 번호 없음'; end if;
  if coalesce((p->>'official')::boolean, true) = false then return 'skip:개인 일정'; end if;
  select room_id into r from cases
  where (nullif(p->>'caseRef', '') is not null and external_ref = p->>'caseRef')
     or (nullif(p->>'caseNo', '') is not null and case_no = trim(p->>'caseNo'))
  limit 1;
  if r is null then return 'skip:연결 안 된 사건'; end if;

  gone := case
    when coalesce((p->>'deleted')::boolean, false) then '삭제'
    when '기일소거' = any (flags) then '기일소거'
    when '추정' = any (flags) then '추정'
    when '부진행' = any (flags) then '부진행' end;

  -- 불변기간
  if '불변' = any (flags) then
    if gone is not null then delete from case_deadlines where external_id = ext; return 'cancelled'; end if;
    if nullif(p->>'date', '') is null then return 'skip:날짜 없음'; end if;
    insert into case_deadlines (room_id, label, due_date, source, external_id)
    values (r, left(coalesce(nullif(trim(p->>'name'), ''), '불변기간'), 60), (p->>'date')::date, 'daeryuntop', ext)
    on conflict (external_id) do update set room_id = excluded.room_id, label = excluded.label, due_date = excluded.due_date;
    update case_deadlines set handled_at = case when '완료' = any (flags) then coalesce(handled_at, now()) end where external_id = ext;
    -- 전에 일반 기일로 왔던 것은 지웁니다
    delete from hearings where external_id = ext;
    return 'deadline';
  end if;

  select * into prev from hearings where external_id = ext;
  -- 엑셀은 기일 번호가 없어 '사건번호:기일명:날짜'로 받습니다. 같은 이름의 다가오는 기일이 있으면 날짜가 바뀐 것으로 봅니다.
  if prev.id is null and ext like 'xl:%' then
    select * into prev from hearings
    where room_id = r and source = 'daeryuntop' and external_id like 'xl:%' and date >= today
      and regexp_replace(label, ' \[엄수\]$', '') = trim(p->>'name')
    order by date limit 1;
  end if;

  if gone is not null then
    if prev.id is null then return 'skip:없는 기일 취소'; end if;
    if prev.firm_only then
      delete from hearings where id = prev.id;
      perform daeryuntop_firm_push(r, '기일 취소', prev.label || ' ' || push_when(prev.date, prev.time) || ' (' || gone || ')');
    else
      perform sync_hearing(r, 'cancelled', prev.label || ' (' || gone || ')', prev.date, prev.time, prev.place, prev.id, 'daeryuntop');
    end if;
    return 'cancelled';
  end if;
  if '완료' = any (flags) then
    if prev.id is not null then update hearings set external_id = ext where id = prev.id; end if;
    return 'skip:완료된 기일';
  end if;

  if nullif(p->>'date', '') is null then return 'skip:날짜 없음'; end if;
  d := (p->>'date')::date;
  -- 대륜탑은 시각이 없으면 00:00으로 둡니다
  t := case when nullif(p->>'time', '') is null or p->>'time' = '00:00' then null else (p->>'time')::time end;
  v_place := nullif(concat_ws(' ', nullif(trim(p->>'court'), ''), nullif(trim(p->>'place'), '')), '');
  lbl := left(trim(coalesce(nullif(trim(p->>'name'), ''), '기일')), 50) || case when v_strict then ' [엄수]' else '' end;

  if prev.id is null then
    if d < today then return 'skip:지난 기일'; end if;
    if v_firm_only then
      insert into hearings (room_id, label, date, time, place, source, external_id, firm_only, strict)
      values (r, lbl, d, t, v_place, 'daeryuntop', ext, true, v_strict);
      perform daeryuntop_firm_push(r, '새 기일', lbl || ' ' || push_when(d, t) || coalesce(E'\n' || v_place, ''));
    else
      prev.id := gen_random_uuid();
      perform sync_hearing(r, 'new', lbl, d, t, v_place, null, 'daeryuntop', prev.id);
      update hearings set external_id = ext, strict = v_strict where id = prev.id;
    end if;
    return 'new';
  end if;

  update hearings set external_id = ext, strict = v_strict where id = prev.id;
  if prev.label = lbl and prev.date = d and prev.time is not distinct from t and prev.place is not distinct from v_place then return 'same'; end if;
  if prev.firm_only then
    update hearings set label = lbl, date = d, time = t, place = v_place where id = prev.id;
    perform daeryuntop_firm_push(r, '기일 변경', lbl || ' ' || push_when(prev.date, prev.time) || ' → ' || push_when(d, t));
  else
    perform sync_hearing(r, 'changed', lbl, d, t, v_place, prev.id, 'daeryuntop');
  end if;
  return 'changed';
end $$;

-- 변호사·직원 전용 기일 푸시 (사건방 카드 없이)
create function public.daeryuntop_firm_push(p_room uuid, p_head text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into push_outbox (user_id, title, body, data)
  select m.user_id, push_case_title(p_head, p_room), p_body, jsonb_build_object('kind', 'hearing', 'roomId', p_room)
  from room_members m join profiles u on u.id = m.user_id
  where m.room_id = p_room and u.role <> 'client' and u.active;
  if found then perform kick_push(); end if;
end $$;

-- 어드민: 엑셀로 받은 기일 여러 줄 (줄마다 결과를 돌려줌)
create function public.admin_import_daeryuntop(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; out jsonb := '[]';
begin
  if not is_super_admin() then raise exception '관리자어드민만 올릴 수 있습니다.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception '한 번에 2000줄까지 올릴 수 있습니다.'; end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    begin
      out := out || jsonb_build_object('id', x->>'id', 'caseNo', x->>'caseNo', 'result', ingest_daeryuntop_hearing(x));
    exception when others then
      out := out || jsonb_build_object('id', x->>'id', 'caseNo', x->>'caseNo', 'result', 'skip:' || sqlerrm);
    end;
  end loop;
  return out;
end $$;

-- 어드민: 앱 사건에 대륜탑 사건번호 연결
create function public.admin_set_case_no(p_room uuid, p_case_no text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 바꿀 수 있습니다.'; end if;
  if exists (select 1 from cases where case_no = nullif(trim(p_case_no), '') and room_id <> p_room) then
    raise exception '이미 다른 사건에 연결된 사건번호입니다.';
  end if;
  update cases set case_no = nullif(trim(p_case_no), '') where room_id = p_room;
  if not found then raise exception '사건을 찾을 수 없습니다.'; end if;
end $$;

-- 어드민 사건 목록에 사건번호를 더합니다
drop function public.admin_deadline_cases();
create function public.admin_deadline_cases() returns table (room_id uuid, title text, alerts_on boolean, office text, deadlines jsonb, case_no text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 볼 수 있습니다.'; end if;
  return query
  select c.room_id, c.title, c.deadline_alerts, deadline_office(c.room_id, null),
    coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'due', d.due_date, 'handledAt', d.handled_at) order by d.due_date)
      from case_deadlines d where d.room_id = c.room_id), '[]'),
    c.case_no
  from cases c
  order by (select min(d.due_date) from case_deadlines d where d.room_id = c.room_id and d.handled_at is null) nulls last, c.title;
end $$;

revoke execute on function
  public.ingest_daeryuntop_hearing(jsonb), public.daeryuntop_firm_push(uuid, text, text),
  public.admin_import_daeryuntop(jsonb), public.admin_set_case_no(uuid, text), public.admin_deadline_cases()
  from public, anon, authenticated;
grant execute on function public.admin_import_daeryuntop(jsonb), public.admin_set_case_no(uuid, text), public.admin_deadline_cases() to authenticated;
grant execute on function public.ingest_daeryuntop_hearing(jsonb) to service_role;
