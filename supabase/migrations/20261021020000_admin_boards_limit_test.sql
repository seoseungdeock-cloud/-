-- 승덕 요청 2026-10-21
-- 1) 어드민도 변호사와 같은 게시판을 봅니다 (변호사 게시판, 사건자문, 경조사, 고객만족사례, 법령개정, 불변기간 공지 포함).
--    어드민 권한(실제 작성자 보기, 삭제, 기간 제한)은 모든 게시판에서 그대로입니다.
-- 2) 불변기간 알림 시험: 관리자어드민이 '[테스트]' 가짜 사건을 만들고, 알림(3일 전 / 만료일 경고 글 / 도과 / 아침 알림)을
--    지금 바로 보내 봅니다. 가짜 사건은 예약 작업이 건드리지 않도록 사건 알림을 꺼 두고(deadline_alerts = false),
--    시험 알림은 그 사건의 시험 변호사 계정과 누른 사람에게만 갑니다. 지우기 한 번으로 모두 없어집니다.

create or replace function public.can_see_board(b public.board_kind) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when b = 'anon' then me_role() is not null
    else me_role() in ('lawyer', 'admin')
  end
$$;

create function public.test_case_guard() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception '관리자어드민만 쓸 수 있습니다.'; end if;
end $$;

-- 가짜 사건 3개: D-3 / 오늘 만료 / 어제 도과 (+ 조치 완료 1건). 시험 변호사 계정(lawyer)과 누른 사람이 사건방에 들어갑니다.
create function public.admin_seed_test_deadlines() returns int language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  me uuid := auth.uid();
  lw uuid;
  r uuid;
  x record;
  n int := 0;
begin
  perform test_case_guard();
  if exists (select 1 from cases where title like '[테스트]%') then raise exception '이미 가짜 사건이 있습니다. 먼저 지워 주세요.'; end if;
  select id into lw from profiles where login_id = 'lawyer' and role = 'lawyer' and active;
  for x in select * from (values
    ('[테스트] 대여금 청구', '민사', '항소기간', today + 3, false),
    ('[테스트] 사기 형사사건', '형사', '항소기간', today, false),
    ('[테스트] 영업정지 취소', '행정', '행정소송 제소기간', today - 1, false),
    ('[테스트] 대여금 청구', '민사', '상고기간', today + 20, true)
  ) as v(title, field, label, due, handled)
  loop
    select room_id into r from cases where title = x.title;
    if r is null then
      insert into rooms (kind, mode, title, created_by) values ('case', 'private', x.title, me) returning id into r;
      insert into room_members (room_id, user_id, is_master) values (r, me, true);
      if lw is not null and lw <> me then insert into room_members (room_id, user_id) values (r, lw); end if;
      insert into cases (room_id, title, field, stage, deadline_alerts) values (r, x.title, x.field, '진행', false);
    end if;
    insert into case_deadlines (room_id, label, due_date, created_by, handled_at, handled_by)
    values (r, x.label, x.due, me, case when x.handled then now() end, case when x.handled then me end);
    n := n + 1;
  end loop;
  return n;
end $$;

-- 가짜 사건 지우기 (사건방·불변기간·경고 글 모두)
create function public.admin_clear_test_deadlines() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform test_case_guard();
  delete from posts where source_id in (select 'deadline:' || d.id from case_deadlines d join cases c on c.room_id = d.room_id where c.title like '[테스트]%');
  delete from rooms where id in (select room_id from cases where title like '[테스트]%');
  get diagnostics n = row_count;
  return n;
end $$;

-- 시험 알림 지금 보내기. p_slot: d3(3일 전) / d0(만료일 경고 글 + 알림) / over(도과) / digest(아침 알림)
-- 실제 예약 작업과 같은 문구로, 그 사건의 시험 변호사와 누른 사람에게만 보냅니다. 보낸 제목·본문을 돌려줍니다.
create function public.admin_fire_test_deadline(p_deadline uuid, p_slot text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d case_deadlines; c cases;
  today date := (now() at time zone 'Asia/Seoul')::date;
  head text; body text; office text; names text; n int;
begin
  perform test_case_guard();
  select * into d from case_deadlines where id = p_deadline;
  select * into c from cases where room_id = d.room_id;
  if d.id is null or c.title not like '[테스트]%' then raise exception '가짜 사건의 불변기간만 시험할 수 있습니다.'; end if;
  if p_slot = 'digest' then
    head := '남은 불변기간 1건';
    body := case when d.due_date < today then '도과' when d.due_date = today then '오늘 만료' else 'D-' || (d.due_date - today) end || ' ' || d.label || ' · ' || c.title;
  elsif p_slot in ('d3', 'd0', 'over') then
    head := case p_slot when 'd3' then '불변기간 3일 전' when 'd0' then '불변기간 오늘 만료' else '불변기간 도과' end || ' · ' || c.title;
    body := d.label || ' ' || push_when(d.due_date, null) || case p_slot
      when 'over' then E' 만료\n조치 완료 표시가 없습니다. 바로 확인해 주세요.'
      else E' 24:00 만료\n조치했으면 앱에서 ''조치 완료''를 눌러 주세요.' end;
  else
    raise exception '알 수 없는 알림입니다.';
  end if;

  insert into push_outbox (user_id, title, body, data)
  select u, head, body, jsonb_build_object('kind', 'deadline', 'roomId', d.room_id, 'deadlineId', d.id)
  from (select deadline_lawyers(d.room_id, d.lawyer_id) as u union select auth.uid()) t
  where u is not null;
  get diagnostics n = row_count;

  if p_slot = 'd0' then
    office := deadline_office(d.room_id, d.lawyer_id);
    select string_agg(p.nickname, ', ' order by p.nickname) into names from profiles p where p.id in (select deadline_lawyers(d.room_id, d.lawyer_id));
    delete from posts where source_id = 'deadline:' || d.id;
    insert into posts (board, author_bot, title, body, source_id)
    values ('deadline', 'bot_deadline',
      '[' || office || '] 불변기간 오늘 만료 · ' || c.title || ' ' || d.label,
      '사건: ' || c.title || E'\n불변기간: ' || d.label || ' · ' || push_when(d.due_date, null) || E' 24:00 만료\n담당 변호사: ' || coalesce(names, '미지정')
        || E'\n\n만료 하루 전 24시까지 조치 완료 표시가 없어 자동으로 올린 글입니다.',
      'deadline:' || d.id);
  end if;
  perform kick_push();
  return jsonb_build_object('title', head, 'body', body, 'recipients', n, 'post', p_slot = 'd0');
end $$;

revoke execute on function public.test_case_guard(), public.admin_seed_test_deadlines(), public.admin_clear_test_deadlines(), public.admin_fire_test_deadline(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_seed_test_deadlines(), public.admin_clear_test_deadlines(), public.admin_fire_test_deadline(uuid, text) to authenticated;
