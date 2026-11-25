-- SKYZAI 어드민 「메신저」 탭 (2026-11-29) — 사용 현황·방 목록·대화 원문을 SKYZAI 어드민 콘솔(/admin)에서 봅니다.
--
-- 누가 부르나: 서버 함수 skyzai-bridge 만 (service_role). 로그인 사용자(authenticated)에게는 실행 권한이 없습니다 —
-- 스카이넷 안의 최고 관리자 권한(is_super_admin)과 별개로, SKYZAI 쪽 어드민 콘솔 명단이 접근을 정합니다.
-- 대화 원문을 꺼내 볼 때는 audit_log 에 'monitor.messages' 로 남깁니다(누가·어느 방·언제). 사용 현황·방 목록 조회는 남기지 않습니다.
--
-- 시각은 모두 UTC 로 돌려주고, 날짜 묶음만 Asia/Seoul 기준입니다.

-- ───────────────────────── 1) 사용 현황 ─────────────────────────
-- 기간 안의 글(사람이 보낸 것만 — AI·봇·안내 글 제외) 합계, 날짜별, 사람별, 방 종류별.
create or replace function public.skyzai_monitor_stats(p_from timestamptz, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, now() - interval '30 days'); t timestamptz := coalesce(p_to, now()); out jsonb;
begin
  with m as (
    select x.*, (x.created_at at time zone 'Asia/Seoul')::date as d, coalesce(jsonb_array_length(x.attachments), 0) as n_att
      from messages x where x.created_at >= f and x.created_at < t and x.sender_kind = 'user'
  )
  select jsonb_build_object(
    'from', f, 'to', t,
    'totals', (select jsonb_build_object(
        'messages', count(*), 'senders', count(distinct sender_id), 'rooms_active', count(distinct room_id),
        'files', coalesce(sum(n_att), 0), 'recalled', count(*) filter (where recalled),
        'rooms_created', (select count(*) from rooms r where r.created_at >= f and r.created_at < t),
        'members_total', (select count(*) from profiles p where p.active and p.role <> 'client'),
        'logins', (select count(*) from audit_log a where a.action in ('login', 'auth.login') and a.at >= f and a.at < t)
      ) from m),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'messages', n, 'senders', s, 'files', fa) order by d), '[]')
                from (select d, count(*) n, count(distinct sender_id) s, coalesce(sum(n_att), 0) fa from m group by d) q),
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
                  'login', p.login_id, 'nickname', p.nickname, 'title', p.title, 'dept', p.dept, 'branch', p.branch,
                  'messages', q.n, 'files', q.fa, 'rooms', q.r, 'last_at', q.last_at) order by q.n desc, q.last_at desc), '[]')
                 from (select sender_id, count(*) n, coalesce(sum(n_att), 0) fa, count(distinct room_id) r, max(created_at) last_at
                         from m group by sender_id order by n desc limit 200) q
                 join profiles p on p.id = q.sender_id),
    'kinds', (select coalesce(jsonb_agg(jsonb_build_object('kind', k, 'rooms', r, 'messages', n) order by n desc), '[]')
                from (select r.kind::text k, count(distinct r.id) r, count(m.id) n from rooms r join m on m.room_id = r.id group by r.kind) q)
  ) into out from (select 1) one;
  return out;
end $$;

-- ───────────────────────── 2) 방 목록 ─────────────────────────
-- 기간 안에 글이 있었던 방(기간이 null 이면 전부), 마지막 글 순. p_q 는 방 이름·구성원 이름·사번으로 걸러냅니다.
create or replace function public.skyzai_monitor_rooms(p_q text default null, p_from timestamptz default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_q, '')), ''); lim int := greatest(1, least(coalesce(p_limit, 100), 500)); out jsonb;
begin
  with r as (
    select r.id, r.kind, r.mode, r.title, r.created_at,
           (select login_id from profiles where id = r.created_by) as created_by,
           (select count(*) from room_members mm where mm.room_id = r.id) as member_count,
           (select count(*) from messages x where x.room_id = r.id and x.sender_kind = 'user') as messages,
           (select count(*) from messages x where x.room_id = r.id and x.sender_kind = 'user' and p_from is not null and x.created_at >= p_from) as messages_period,
           (select coalesce(sum(jsonb_array_length(x.attachments)), 0) from messages x where x.room_id = r.id) as files,
           (select max(x.created_at) from messages x where x.room_id = r.id) as last_at
      from rooms r
     where (p_from is null or exists (select 1 from messages x where x.room_id = r.id and x.created_at >= p_from))
       and (q is null or r.title ilike '%' || q || '%'
            or exists (select 1 from room_members mm join profiles p on p.id = mm.user_id
                        where mm.room_id = r.id and (p.nickname ilike '%' || q || '%' or p.login_id ilike '%' || lower(q) || '%')))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'kind', r.kind, 'mode', r.mode, 'title', r.title, 'created_at', r.created_at, 'created_by', r.created_by,
           'member_count', r.member_count, 'messages', r.messages, 'messages_period', r.messages_period, 'files', r.files, 'last_at', r.last_at,
           'members', coalesce((select jsonb_agg(jsonb_build_object('login', p.login_id, 'nickname', p.nickname, 'is_master', mm.is_master) order by mm.joined_at)
                                 from (select * from room_members mm where mm.room_id = r.id order by mm.joined_at limit 30) mm
                                 join profiles p on p.id = mm.user_id), '[]'),
           'last_preview', (select case when x.recalled then '(회수됨)'
                                        when coalesce(x.text, '') <> '' then left(x.text, 80)
                                        when jsonb_array_length(x.attachments) > 0 then '(파일 ' || jsonb_array_length(x.attachments) || ')'
                                        else '' end
                              from messages x where x.room_id = r.id order by x.seq desc limit 1)
         ) order by r.last_at desc nulls last, r.created_at desc), '[]')
    into out
    from (select * from r order by last_at desc nulls last, created_at desc limit lim) r;
  return out;
end $$;

-- ───────────────────────── 3) 방 대화 원문 ─────────────────────────
-- 한 방의 글을 순번 내림차순으로 한 쪽(p_before 앞). 회수된 글은 본문 대신 '(회수됨)'. 첨부는 이름·크기만(내려받기 주소는 주지 않습니다).
create or replace function public.skyzai_monitor_messages(p_room uuid, p_before bigint default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := greatest(1, least(coalesce(p_limit, 100), 300)); rows jsonb; n int; room jsonb;
begin
  select jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'created_at', r.created_at,
           'members', coalesce((select jsonb_agg(jsonb_build_object('login', p.login_id, 'nickname', p.nickname, 'is_master', mm.is_master) order by mm.joined_at)
                                 from room_members mm join profiles p on p.id = mm.user_id where mm.room_id = r.id), '[]'),
           'messages', (select count(*) from messages x where x.room_id = r.id))
    into room from rooms r where r.id = p_room;
  if room is null then raise exception '방을 찾을 수 없습니다.'; end if;
  select coalesce(jsonb_agg(j order by (j ->> 'seq')::bigint), '[]'), count(*) into rows, n
    from (select jsonb_build_object(
                   'seq', m.seq, 'id', m.id, 'at', m.created_at,
                   'sender', case when m.sender_kind = 'user' then (select login_id from profiles where id = m.sender_id) else m.sender_kind::text end,
                   'sender_name', coalesce(m.bot_name, (select nickname from profiles where id = m.sender_id)),
                   'sender_kind', m.sender_kind, 'kind', m.kind,
                   'text', case when m.recalled then '' else m.text end,
                   'recalled', m.recalled, 'edited', m.edited_at is not null,
                   'attachments', case when m.recalled then '[]'::jsonb else
                     coalesce((select jsonb_agg(jsonb_build_object('name', a ->> 'name', 'size', case when a ->> 'size' ~ '^[0-9]+$' then (a ->> 'size')::bigint end, 'kind', a ->> 'kind')) from jsonb_array_elements(m.attachments) a), '[]') end,
                   'reply_to', (select jsonb_build_object('seq', p.seq, 'sender_name', coalesce(p.bot_name, (select nickname from profiles where id = p.sender_id)),
                                                          'text', case when p.recalled then '(회수됨)' else left(p.text, 120) end)
                                  from messages p where p.id = m.reply_to),
                   'reactions', (select count(*) from message_reactions rr where rr.message_id = m.id)
                 ) as j
            from messages m where m.room_id = p_room and (p_before is null or m.seq < p_before)
           order by m.seq desc limit lim + 1) s;
  if n > lim then rows := rows - 0; end if;  -- 한 줄 더 읽은 가장 옛 글(첫 원소)은 '더 있음' 판단에만 쓰고 뺀다
  return jsonb_build_object('room', room, 'items', rows, 'more', n > lim);
end $$;

-- ───────────────────────── 4) 열람 기록 ─────────────────────────
-- 대화 원문을 꺼내 본 사람을 audit_log 에 남깁니다. 행위자는 SKYZAI 어드민의 사번(스카이넷 계정이 있으면 그 id).
create or replace function public.skyzai_monitor_log(p_actor_login text, p_room uuid, p_detail jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, target_kind, target_id, room_id, detail)
  values ((select id from profiles where login_id = lower(trim(coalesce(p_actor_login, '')))), 'monitor.messages', 'room', p_room::text, p_room,
          coalesce(p_detail, '{}') || jsonb_build_object('via', 'skyzai', 'actor_login', lower(trim(coalesce(p_actor_login, '')))))
$$;

revoke execute on function
  public.skyzai_monitor_stats(timestamptz, timestamptz), public.skyzai_monitor_rooms(text, timestamptz, int),
  public.skyzai_monitor_messages(uuid, bigint, int), public.skyzai_monitor_log(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.skyzai_monitor_stats(timestamptz, timestamptz), public.skyzai_monitor_rooms(text, timestamptz, int),
  public.skyzai_monitor_messages(uuid, bigint, int), public.skyzai_monitor_log(text, uuid, jsonb)
  to service_role;
