-- 감사 · 모니터링 (2026-11-24) — 네이버웍스 Audit·Monitoring API 대응. 법무법인은 분쟁·감사 때 대화 기록을 내야 하므로 꼭 필요.
--
-- audit_log : 누가 언제 무엇을 했나. 트리거가 자동으로 쌓음 (메시지 보냄·회수, 방 들어옴·나감, 글 작성·삭제, 계정 중지/재개, 로그인, 봇 발급).
--             관리자어드민만 봄. 아무도 고치거나 지우지 못함 (service_role 제외).
-- export_room_messages : 방 하나의 대화 전체(기간)를 표로 — 관리자어드민. CSV 로 내려받기용.
-- audit_recent         : 최근 기록 조회 (행위·사람·기간 필터).

create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  target_kind text,
  target_id text,
  room_id uuid,
  detail jsonb not null default '{}'
);
create index audit_log_at on public.audit_log (at desc);
create index audit_log_actor on public.audit_log (actor_id, at desc);
create index audit_log_action on public.audit_log (action, at desc);
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (is_super_admin());
-- insert/update/delete 정책 없음 → 로그인 사용자는 못 함. 트리거(security definer)와 service_role 만 씀.

create function public.audit(p_action text, p_kind text, p_id text, p_room uuid, p_detail jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, target_kind, target_id, room_id, detail) values (auth.uid(), p_action, p_kind, p_id, p_room, coalesce(p_detail, '{}'))
$$;
revoke all on function public.audit(text, text, text, uuid, jsonb) from public, anon, authenticated;

-- 메시지: 보냄·회수 (본문은 남기지 않음 — 본문은 messages 에 있고 export 로 봄. 길이·종류·첨부 수만)
create function public.audit_messages() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit('message.send', 'message', new.id::text, new.room_id, jsonb_build_object('kind', new.kind, 'sender_kind', new.sender_kind, 'length', char_length(new.text), 'attachments', coalesce(jsonb_array_length(new.attachments), 0), 'bot', new.bot_name));
  elsif tg_op = 'UPDATE' and new.recalled and not old.recalled then
    perform audit('message.recall', 'message', new.id::text, new.room_id, jsonb_build_object('age_sec', extract(epoch from now() - old.created_at)::int));
  end if;
  return null;
end $$;
create trigger audit_messages after insert or update on public.messages for each row execute function public.audit_messages();

-- 방: 들어옴·나감·이름 바뀜
create function public.audit_room_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform audit('room.join', 'user', new.user_id::text, new.room_id, '{}');
  elsif tg_op = 'DELETE' then perform audit('room.leave', 'user', old.user_id::text, old.room_id, '{}');
  end if;
  return null;
end $$;
create trigger audit_room_members after insert or delete on public.room_members for each row execute function public.audit_room_members();

create function public.audit_rooms() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform audit('room.create', 'room', new.id::text, new.id, jsonb_build_object('kind', new.kind, 'title', new.title));
  elsif tg_op = 'UPDATE' and new.title <> old.title then perform audit('room.rename', 'room', new.id::text, new.id, jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  return null;
end $$;
create trigger audit_rooms after insert or update on public.rooms for each row execute function public.audit_rooms();

-- 게시판: 글 작성·삭제
create function public.audit_posts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform audit('post.create', 'post', new.id::text, null, jsonb_build_object('board', new.board, 'title', new.title));
  elsif tg_op = 'DELETE' then perform audit('post.delete', 'post', old.id::text, null, jsonb_build_object('board', old.board, 'title', old.title));
  end if;
  return null;
end $$;
create trigger audit_posts after insert or delete on public.posts for each row execute function public.audit_posts();

-- 계정: 중지/재개, 역할 변경, 로그인
create function public.audit_profiles() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active <> old.active then perform audit(case when new.active then 'account.enable' else 'account.disable' end, 'user', new.id::text, null, jsonb_build_object('login_id', new.login_id)); end if;
  if new.role <> old.role then perform audit('account.role', 'user', new.id::text, null, jsonb_build_object('from', old.role, 'to', new.role)); end if;
  if new.last_login_at is distinct from old.last_login_at and new.last_login_at is not null then perform audit('login', 'user', new.id::text, null, '{}'); end if;
  return null;
end $$;
create trigger audit_profiles after update on public.profiles for each row execute function public.audit_profiles();

-- 봇: 발급·중지
create function public.audit_bots() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform audit('bot.create', 'bot', new.id::text, null, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' and new.active <> old.active then perform audit(case when new.active then 'bot.enable' else 'bot.disable' end, 'bot', new.id::text, null, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' and new.token_hash <> old.token_hash then perform audit('bot.rotate', 'bot', new.id::text, null, jsonb_build_object('name', new.name));
  end if;
  return null;
end $$;
create trigger audit_bots after insert or update on public.bots for each row execute function public.audit_bots();

-- 최근 기록 (관리자어드민). p_action 은 접두어로도 됨 ('message' → message.send/recall)
create function public.audit_recent(p_limit int default 200, p_action text default null, p_actor uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns table (id bigint, at timestamptz, actor_id uuid, actor_name text, action text, target_kind text, target_id text, room_id uuid, room_title text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception '관리자어드민만 볼 수 있습니다.'; end if;
  return query
    select a.id, a.at, a.actor_id, p.nickname, a.action, a.target_kind, a.target_id, a.room_id, r.title, a.detail
      from audit_log a left join profiles p on p.id = a.actor_id left join rooms r on r.id = a.room_id
     where (p_action is null or a.action like p_action || '%') and (p_actor is null or a.actor_id = p_actor)
       and (p_from is null or a.at >= p_from) and (p_to is null or a.at < p_to)
     order by a.at desc limit least(greatest(coalesce(p_limit, 200), 1), 2000);
end $$;
grant execute on function public.audit_recent(int, text, uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.audit_recent(int, text, uuid, timestamptz, timestamptz) from public, anon;

-- 방 대화 내보내기 (관리자어드민). 회수된 메시지는 '(회수됨)' 으로.
create function public.export_room_messages(p_room uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (at timestamptz, sender text, sender_kind text, kind text, text text, attachments int, recalled boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception '관리자어드민만 내보낼 수 있습니다.'; end if;
  perform audit('export.messages', 'room', p_room::text, p_room, jsonb_build_object('from', p_from, 'to', p_to));
  return query
    select m.created_at, coalesce(m.bot_name, p.nickname, m.sender_kind::text), m.sender_kind::text, m.kind::text,
           case when m.recalled then '(회수됨)' else m.text end, coalesce(jsonb_array_length(m.attachments), 0), m.recalled
      from messages m left join profiles p on p.id = m.sender_id
     where m.room_id = p_room and (p_from is null or m.created_at >= p_from) and (p_to is null or m.created_at < p_to)
     order by m.created_at;
end $$;
grant execute on function public.export_room_messages(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.export_room_messages(uuid, timestamptz, timestamptz) from public, anon;

-- 관리자어드민이 모든 방 제목을 고를 수 있게 (내보내기 대상 선택용)
create function public.admin_rooms()
returns table (id uuid, title text, kind text, member_count int, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception '관리자어드민만 볼 수 있습니다.'; end if;
  return query
    select r.id, r.title, r.kind::text, (select count(*) from room_members mm where mm.room_id = r.id)::int, (select max(m.created_at) from messages m where m.room_id = r.id)
      from rooms r order by 5 desc nulls last;
end $$;
grant execute on function public.admin_rooms() to authenticated;
revoke execute on function public.admin_rooms() from public, anon;
