-- SKYZAI(song_mu) 메신저 화면이 스카이넷을 저장소로 씁니다 (2026-11-18).
-- SKYZAI 의 자체 메신저 표(SONGMU msg_*)는 걷어내고, 그 화면(Flask /messenger)이 여기 rooms·messages 를 읽고 씁니다.
-- SKYZAI 서버는 사용자의 스카이넷 세션(함수 skyzai-bridge 가 발급)으로 아래 함수를 부르므로, 권한은 앱과 똑같이 auth.uid() 기준입니다.
--
-- 1) messages.seq — SKYZAI 화면은 글 번호가 '커지는 정수'라고 가정합니다(새 글 받기 after_id, 읽음 위치 last_id).
--    uuid 와 별개로 전역 순번을 둡니다. 앱은 쓰지 않습니다.
-- 2) messages.edited_at + edit_message — SKYZAI 화면의 '글 고치기'. 앱은 바뀐 글을 updated_at 으로 받아 그대로 보여 줍니다.
-- 3) skyzai_* 함수 — 화면이 3초마다 부르는 sync 가 왕복 한 번으로 끝나도록 화면에 필요한 모양(jsonb)으로 묶어 돌려줍니다.

-- ───────────────────────── 1) 순번 ─────────────────────────
alter table public.messages add column if not exists seq bigint;
create sequence if not exists public.messages_seq owned by public.messages.seq;
alter table public.messages alter column seq set default nextval('public.messages_seq');
with o as (select id, row_number() over (order by created_at, id) as rn from public.messages where seq is null)
update public.messages m set seq = o.rn from o where o.id = m.id;
select setval('public.messages_seq', coalesce((select max(seq) from public.messages), 0) + 1, false);
alter table public.messages alter column seq set not null;
grant usage, select on sequence public.messages_seq to authenticated, service_role;
create unique index if not exists messages_seq_key on public.messages (seq);
create index if not exists messages_room_seq on public.messages (room_id, seq);

-- ───────────────────────── 2) 글 고치기 ─────────────────────────
alter table public.messages add column if not exists edited_at timestamptz;

create or replace function public.edit_message(p_id uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_text, ''));
begin
  if t = '' then raise exception '메시지를 입력해 주세요.'; end if;
  if char_length(t) > 4000 then raise exception '글은 4,000자까지 쓸 수 있습니다.'; end if;
  update messages set text = t, edited_at = now()
   where id = p_id and sender_id = auth.uid() and kind = 'text' and not recalled;
  if not found then raise exception '고칠 수 없는 메시지입니다.'; end if;
end $$;
revoke execute on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

-- 공감이 바뀌면 글의 updated_at 도 올립니다 — SKYZAI 화면은 '이미 그린 글 중 바뀐 것'을 updated_at 으로 받습니다.
-- (앱은 공감을 따로 받고 있어 영향이 없고, 바뀐 글을 한 번 더 받을 뿐입니다.)
create or replace function public.touch_message_of_reaction() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update messages set updated_at = clock_timestamp() where id = coalesce(new.message_id, old.message_id);
  return null;
end $$;
revoke execute on function public.touch_message_of_reaction() from public, anon, authenticated;
drop trigger if exists reactions_touch_message on public.message_reactions;
create trigger reactions_touch_message after insert or update or delete on public.message_reactions
  for each row execute function public.touch_message_of_reaction();

-- ───────────────────────── 3) SKYZAI 화면용 함수 ─────────────────────────
-- 사람은 사번(profiles.login_id)으로 주고받습니다 — SKYZAI 는 사번으로 사람을 알고, 이름·직위·사진은 ERP 에서 붙입니다.

-- 사번 → 계정 id (내가 볼 수 있는 사람만)
create or replace function public.skyzai_profile_ids(p_logins text[]) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(p.login_id, p.id), '{}')
    from profiles p where p.login_id = any (coalesce(p_logins, '{}')) and can_see_profile(p.id)
$$;

-- 글 한 줄을 SKYZAI 가 쓰는 모양으로
create or replace function public.skyzai_message_json(m public.messages) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'seq', m.seq, 'id', m.id, 'room_id', m.room_id,
    'sender', case when m.sender_kind = 'user' then (select login_id from profiles where id = m.sender_id) else m.sender_kind::text end,
    'sender_kind', m.sender_kind, 'kind', m.kind, 'text', m.text,
    'created_at', m.created_at, 'updated_at', m.updated_at,
    'recalled', m.recalled, 'edited', m.edited_at is not null,
    'attachments', coalesce(m.attachments, '[]'),
    'forward_of', m.forward_of, 'bundle', m.bundle,
    'contact', (select login_id from profiles where id = m.contact_id),
    'reply_to', (select jsonb_build_object(
                   'seq', p.seq,
                   'sender', case when p.sender_kind = 'user' then (select login_id from profiles where id = p.sender_id) else p.sender_kind::text end,
                   'kind', p.kind, 'text', p.text, 'recalled', p.recalled, 'attachments', coalesce(p.attachments, '[]'))
                 from messages p where p.id = m.reply_to),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'login', pr.login_id) order by pr.login_id)
                           from message_reactions r join profiles pr on pr.id = r.user_id where r.message_id = m.id), '[]')
  )
$$;

-- 내가 볼 수 있는 글인가: 방 참여자이고, 내가 지우지 않았고, 의뢰인이면 staff_only 제외 (읽기 정책과 같은 규칙)
create or replace function public.skyzai_visible(m public.messages) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from message_hides h where h.message_id = m.id and h.user_id = auth.uid())
     and (not m.staff_only or me_role() <> 'client')
$$;

-- 한 방의 글. p_after 가 있으면 그 뒤(새 글), 아니면 p_before 앞(옛 글) 한 쪽.
create or replace function public.skyzai_messages(p_room uuid, p_before bigint default null, p_after bigint default null, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lim int := greatest(1, least(coalesce(p_limit, 50), 200)); rows jsonb; n int;
begin
  if not is_member(p_room) then raise exception '참여 중인 방이 아닙니다.'; end if;
  if p_after is not null then
    select coalesce(jsonb_agg(skyzai_message_json(m) order by m.seq), '[]'), count(*) into rows, n
      from (select * from messages x where x.room_id = p_room and x.seq > p_after and skyzai_visible(x) order by x.seq limit lim + 1) m;
    if n > lim then rows := rows - (jsonb_array_length(rows) - 1); end if;
  else
    select coalesce(jsonb_agg(skyzai_message_json(m) order by m.seq), '[]'), count(*) into rows, n
      from (select * from messages x where x.room_id = p_room and (p_before is null or x.seq < p_before) and skyzai_visible(x) order by x.seq desc limit lim + 1) m;
    if n > lim then rows := rows - 0; end if;  -- 한 줄 더 읽은 가장 옛 글(첫 원소)은 '더 있음' 판단에만 쓰고 뺀다
  end if;
  return jsonb_build_object('items', rows, 'more', n > lim);
end $$;

-- 글 하나 (순번으로). 참여자가 아니면 null.
create or replace function public.skyzai_message(p_seq bigint) returns jsonb language sql stable security definer set search_path = public as $$
  select skyzai_message_json(m) from messages m where m.seq = p_seq and is_member(m.room_id) and skyzai_visible(m)
$$;

-- 방 한 칸의 요약 (목록·상세 공용)
create or replace function public.skyzai_room_json(p_room uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'mode', r.mode, 'title', r.title,
    'created_by', (select login_id from profiles where id = r.created_by),
    'created_at', r.created_at,
    'muted', me.notify = 'off',
    'last_read_seq', coalesce((select max(seq) from messages where room_id = r.id and created_at <= coalesce(me.last_read_at, '-infinity')), 0),
    'unread', (select count(*) from messages x where x.room_id = r.id and x.created_at > coalesce(me.last_read_at, '-infinity')
                 and x.sender_id is distinct from auth.uid() and not x.recalled and skyzai_visible(x)),
    'last_message', (select skyzai_message_json(x) from messages x where x.room_id = r.id and skyzai_visible(x) order by x.seq desc limit 1),
    'last_at', coalesce((select max(created_at) from messages where room_id = r.id), r.created_at),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                  'login', p.login_id, 'is_master', mm.is_master,
                  'last_read_seq', coalesce((select max(seq) from messages where room_id = r.id and created_at <= coalesce(mm.last_read_at, '-infinity')), 0)
                ) order by mm.joined_at, p.login_id)
                from room_members mm join profiles p on p.id = mm.user_id where mm.room_id = r.id), '[]'),
    'notice', (select jsonb_build_object('id', n.id, 'seq', x.seq, 'text', n.text, 'by', (select login_id from profiles where id = n.by_id), 'at', n.created_at)
                 from room_notices n join messages x on x.id = n.message_id
                where n.room_id = r.id and not x.recalled order by n.created_at desc limit 1)
  )
  from rooms r join room_members me on me.room_id = r.id and me.user_id = auth.uid()
  where r.id = p_room
$$;

-- 내 방 목록 — 마지막 글 순. 숨긴 방은 그 뒤 새 글이 있을 때만.
create or replace function public.skyzai_rooms() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(j order by (j ->> 'last_at')::timestamptz desc), '[]')
    from (select skyzai_room_json(m.room_id) as j
            from room_members m
           where m.user_id = auth.uid()
             and (m.hidden_at is null or exists (select 1 from messages x where x.room_id = m.room_id and x.created_at > m.hidden_at))) s
$$;

-- 방별 안 읽은 수와 배지 합계(알림 끈 방 제외)
create or replace function public.skyzai_unread() returns jsonb language sql stable security definer set search_path = public as $$
  with u as (
    select m.room_id, m.notify,
           (select count(*) from messages x where x.room_id = m.room_id and x.created_at > coalesce(m.last_read_at, '-infinity')
              and x.sender_id is distinct from auth.uid() and not x.recalled and skyzai_visible(x)) as n
      from room_members m where m.user_id = auth.uid()
  )
  select jsonb_build_object(
    'rooms', coalesce((select jsonb_object_agg(room_id, n) from u where n > 0), '{}'),
    'total', coalesce((select sum(n) from u where notify <> 'off'), 0))
$$;

-- 3초마다: 열린 방의 새 글 + 이미 그린 글 중 바뀐 것 + 구성원 읽음 위치 + 방별 안 읽은 수
create or replace function public.skyzai_sync(p_room uuid default null, p_after bigint default 0, p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb := jsonb_build_object('now', now()); page jsonb; upd jsonb; rd jsonb;
begin
  if p_room is not null then
    if not is_member(p_room) then
      out := out || jsonb_build_object('left', true);
    else
      page := skyzai_messages(p_room, null, coalesce(p_after, 0), 200);
      select coalesce(jsonb_agg(skyzai_message_json(m) order by m.seq), '[]') into upd
        from (select * from messages x where x.room_id = p_room and x.seq <= coalesce(p_after, 0)
                and p_since is not null and x.updated_at > p_since and skyzai_visible(x) order by x.seq limit 100) m;
      select coalesce(jsonb_object_agg(p.login_id, coalesce((select max(seq) from messages where room_id = p_room and created_at <= coalesce(mm.last_read_at, '-infinity')), 0)), '{}') into rd
        from room_members mm join profiles p on p.id = mm.user_id where mm.room_id = p_room;
      out := out || jsonb_build_object('messages', page -> 'items', 'more', page -> 'more', 'updated', upd, 'read', rd);
    end if;
  end if;
  return out || jsonb_build_object('unread', skyzai_unread());
end $$;

-- 읽음 위치를 글 순번으로 (그 글의 시각까지 읽은 것으로)
create or replace function public.skyzai_mark_read(p_room uuid, p_seq bigint) returns void language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  select created_at into t from messages where seq = p_seq and room_id = p_room;
  if t is null then perform mark_read(p_room); return; end if;
  update room_members set last_read_at = greatest(coalesce(last_read_at, '-infinity'), t) where room_id = p_room and user_id = auth.uid();
end $$;

-- 1:1 방 열기 — 이미 둘만 있는 1:1 방이 있으면 그 방, 없으면 새로 (앱의 규칙과 같음)
create or replace function public.skyzai_open_direct(p_other uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if p_other is null or p_other = auth.uid() then raise exception '대화 상대를 골라 주세요.'; end if;
  select r.id into rid from rooms r
   where r.kind = 'direct'
     and exists (select 1 from room_members a where a.room_id = r.id and a.user_id = auth.uid())
     and exists (select 1 from room_members b where b.room_id = r.id and b.user_id = p_other)
     and (select count(*) from room_members c where c.room_id = r.id) = 2
   order by r.created_at limit 1;
  if rid is not null then
    update room_members set hidden_at = null where room_id = rid and user_id = auth.uid();
    return rid;
  end if;
  return create_room(gen_random_uuid(), 'direct', 'private', '', array[p_other]);
end $$;

-- 공감 켜고 끄기 — 같은 이모지를 다시 누르면 지우고, 다른 이모지면 바꿉니다(한 사람 한 개, 앱과 같음)
create or replace function public.skyzai_react(p_id uuid, p_emoji text) returns void language plpgsql security definer set search_path = public as $$
declare e text := trim(coalesce(p_emoji, ''));
begin
  if e = '' or char_length(e) > 16 then raise exception '공감을 고를 수 없습니다.'; end if;
  if not exists (select 1 from messages m where m.id = p_id and is_member(m.room_id) and not m.recalled) then raise exception '공감할 수 없는 메시지입니다.'; end if;
  if exists (select 1 from message_reactions where message_id = p_id and user_id = auth.uid() and emoji = e) then
    delete from message_reactions where message_id = p_id and user_id = auth.uid();
  else
    insert into message_reactions (message_id, user_id, emoji) values (p_id, auth.uid(), e)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji;
  end if;
end $$;

revoke execute on function
  public.skyzai_profile_ids(text[]), public.skyzai_message_json(public.messages), public.skyzai_visible(public.messages),
  public.skyzai_messages(uuid, bigint, bigint, int), public.skyzai_message(bigint), public.skyzai_room_json(uuid), public.skyzai_rooms(),
  public.skyzai_unread(), public.skyzai_sync(uuid, bigint, timestamptz), public.skyzai_mark_read(uuid, bigint),
  public.skyzai_open_direct(uuid), public.skyzai_react(uuid, text)
  from public, anon;
grant execute on function
  public.skyzai_profile_ids(text[]), public.skyzai_messages(uuid, bigint, bigint, int), public.skyzai_message(bigint),
  public.skyzai_room_json(uuid), public.skyzai_rooms(), public.skyzai_unread(), public.skyzai_sync(uuid, bigint, timestamptz),
  public.skyzai_mark_read(uuid, bigint), public.skyzai_open_direct(uuid), public.skyzai_react(uuid, text)
  to authenticated;
