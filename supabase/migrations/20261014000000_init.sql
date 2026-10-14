-- 라잇나우 1단계: 계정·데이터 서버 저장
-- 원칙
--  · 읽기는 RLS(행 보안)로, 여러 표를 함께 바꾸는 쓰기는 권한을 검사하는 함수(rpc)로만 합니다.
--  · 익명성이 필요한 값(익명 게시판 작성자, 오픈대화방 실제 이용자, 쪽지 상대)은 열 권한으로 숨기고,
--    필요한 사람에게만 보이는 보기(view)·함수로 내보냅니다.
--  · 로그인 아이디는 Supabase 인증의 이메일 자리에 '<아이디>@rightnow.local'로 넣습니다 (실제 메일 발송 없음).

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── 기본 형 ─────────────────────────
create type public.role as enum ('client', 'lawyer', 'staff', 'admin');
create type public.room_kind as enum ('direct', 'group', 'stranger', 'office', 'consult', 'case', 'meeting', 'marketing');
create type public.room_mode as enum ('private', 'ai');
create type public.sender_kind as enum ('user', 'ai', 'bot', 'system');
create type public.message_kind as enum ('text', 'ai', 'system', 'bot', 'contact');
create type public.notify_level as enum ('all', 'mention', 'off');
create type public.case_stage as enum ('상담', '수임', '진행', '종결');
create type public.hearing_source as enum ('daeryuntop', 'manual');
create type public.hearing_change as enum ('new', 'changed', 'cancelled');
create type public.board_kind as enum ('notice', 'anon', 'lawyer', 'advice', 'event', 'praise', 'lawnews', 'skyzai');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.suggestion_status as enum ('open', 'review', 'done', 'hold');

-- ───────────────────────── 사람 ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique check (login_id ~ '^[a-z0-9._-]{3,30}$'),
  nickname text not null check (char_length(nickname) between 1 and 30),
  role public.role not null default 'client',
  firm text,
  office_id text,
  agent_access boolean not null default false,
  membership text not null default 'basic' check (membership in ('basic', 'rightnow')),
  title text,
  dept text,
  branch text,
  phone text,
  email text,
  birthday date,
  joined_at date,
  photo_path text,
  status text check (char_length(status) <= 60),
  presence text not null default 'available',
  super_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  primary key (user_id, target_id)
);

-- 내 정보 (함수 안에서만 씀)
create function public.me_role() returns public.role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and active), false)
$$;
create function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' and super_admin from profiles where id = auth.uid() and active), false)
$$;
create function public.is_firm() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role <> 'client' from profiles where id = auth.uid() and active), false)
$$;
create function public.my_firm() returns text language sql stable security definer set search_path = public as $$
  select firm from profiles where id = auth.uid()
$$;
create function public.can_use_agents() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' or (role in ('staff', 'lawyer') and agent_access) from profiles where id = auth.uid() and active), false)
$$;

-- ───────────────────────── 대화방 ─────────────────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  kind public.room_kind not null,
  mode public.room_mode not null,
  title text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  office_id text,
  lawyer_id text
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_master boolean not null default false,
  pinned boolean not null default false,
  notify public.notify_level not null default 'all',
  hidden_at timestamptz,
  last_read_at timestamptz,
  notice_hidden boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index on public.room_members (user_id);

create function public.is_member(r uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = r and user_id = auth.uid())
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_kind public.sender_kind not null default 'user',
  kind public.message_kind not null default 'text',
  text text not null default '',
  reply_to uuid references public.messages (id) on delete set null,
  forward_of jsonb,
  bundle jsonb,
  recalled boolean not null default false,
  mentions text[] not null default '{}',
  contact_id uuid references public.profiles (id) on delete set null,
  hearing_alert_id uuid,
  -- 시스템·봇·AI 메시지를 앱에서 올린 사람 (추적용, 화면에는 안 보임)
  origin_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (sender_kind <> 'user' or sender_id is not null)
);
create index on public.messages (room_id, created_at);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  primary key (message_id, user_id)
);

create table public.message_hides (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (message_id, user_id)
);

create table public.room_notices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  text text not null,
  by_id uuid references public.profiles (id) on delete set null,
  by_bot boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────────────────── 사건·기일 ─────────────────────────
create table public.cases (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  title text not null,
  field text not null default '',
  stage public.case_stage not null default '수임'
);

create table public.hearings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.cases (room_id) on delete cascade,
  label text not null,
  date date not null,
  time time,
  place text,
  source public.hearing_source not null default 'manual'
);

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.cases (room_id) on delete cascade,
  name text not null,
  file_path text,
  added_at timestamptz not null default now()
);

create table public.case_costs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.cases (room_id) on delete cascade,
  label text not null,
  amount bigint not null default 0
);

create table public.case_progress (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.cases (room_id) on delete cascade,
  note text not null,
  at timestamptz not null default now()
);

create table public.hearing_alerts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  hearing_id uuid,
  change public.hearing_change not null,
  label text not null,
  date date not null,
  time time,
  place text,
  prev_date date,
  prev_time time,
  source public.hearing_source not null,
  message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.hearing_alert_recipients (
  alert_id uuid not null references public.hearing_alerts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  acked_at timestamptz,
  primary key (alert_id, user_id)
);

-- ───────────────────────── 오픈대화방 (닉네임만) ─────────────────────────
create table public.open_rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 30),
  description text not null default '' check (char_length(description) <= 200),
  tags text[] not null default '{}',
  max_members int not null check (max_members in (10, 30, 100, 300)),
  password_hash text,
  created_at timestamptz not null default now()
);

-- user_id는 열 권한으로 숨깁니다. 다른 참여자에게는 member id와 닉네임만 보입니다.
create table public.open_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.open_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 12),
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
create unique index open_members_alias on public.open_members (room_id, alias) where left_at is null;
create unique index open_members_active on public.open_members (room_id, user_id) where left_at is null;

create table public.open_bans (
  room_id uuid not null references public.open_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (room_id, user_id)
);

create table public.open_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.open_rooms (id) on delete cascade,
  member_id uuid references public.open_members (id) on delete set null,
  text text not null,
  system boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.open_member_id(r uuid) returns uuid language sql stable security definer set search_path = public as $$
  select id from open_members where room_id = r and user_id = auth.uid() and left_at is null
$$;

-- ───────────────────────── 게시판 ─────────────────────────
create function public.can_see_board(b public.board_kind) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when b = 'anon' then me_role() is not null
    when b in ('lawyer', 'advice', 'event', 'praise', 'lawnews') then me_role() = 'lawyer'
    else me_role() in ('lawyer', 'admin')
  end
$$;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  board public.board_kind not null default 'anon',
  author_id uuid references public.profiles (id) on delete set null, -- 익명 게시판에서는 숨김
  author_bot text, -- 법령·판례 알림 같은 자동 글
  field text not null default '',
  title text not null,
  body text not null,
  notice boolean not null default false,
  source_id text unique,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- alias_no: 글 안의 익명 번호 (글쓴이 1, 댓글 단 사람은 처음 나온 순서)
create table public.post_aliases (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  alias_no int not null,
  primary key (post_id, user_id),
  unique (post_id, alias_no)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  parent_id uuid references public.comments (id) on delete set null,
  text text not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.post_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  primary key (post_id, user_id)
);

create table public.comment_votes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  primary key (comment_id, user_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  status public.report_status not null default 'open',
  resolution text,
  created_at timestamptz not null default now(),
  unique (reporter_id, post_id, comment_id)
);

create table public.board_bans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  until timestamptz not null
);

create table public.note_threads (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  a_id uuid not null references public.profiles (id) on delete cascade,
  b_id uuid not null references public.profiles (id) on delete cascade,
  a_read_at timestamptz,
  b_read_at timestamptz,
  unique (post_id, a_id, b_id)
);

create table public.note_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.note_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.notice_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  primary key (user_id, post_id)
);

-- ───────────────────────── 건의사항·인증코드 ─────────────────────────
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status public.suggestion_status not null default 'open',
  answer text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.auth_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null check (code ~ '^\d{4,8}$'),
  expires_at timestamptz not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────────────────── 행 보안 (읽기) ─────────────────────────
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_hides enable row level security;
alter table public.room_notices enable row level security;
alter table public.cases enable row level security;
alter table public.hearings enable row level security;
alter table public.case_documents enable row level security;
alter table public.case_costs enable row level security;
alter table public.case_progress enable row level security;
alter table public.hearing_alerts enable row level security;
alter table public.hearing_alert_recipients enable row level security;
alter table public.open_rooms enable row level security;
alter table public.open_members enable row level security;
alter table public.open_bans enable row level security;
alter table public.open_messages enable row level security;
alter table public.posts enable row level security;
alter table public.post_aliases enable row level security;
alter table public.comments enable row level security;
alter table public.post_votes enable row level security;
alter table public.comment_votes enable row level security;
alter table public.reports enable row level security;
alter table public.board_bans enable row level security;
alter table public.note_threads enable row level security;
alter table public.note_messages enable row level security;
alter table public.notice_seen enable row level security;
alter table public.suggestions enable row level security;
alter table public.auth_codes enable row level security;

-- 프로필: 나, 같은 법무법인(로펌 계정끼리), 같은 방 사람, 어드민
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or is_admin()
  or (is_firm() and role <> 'client' and firm is not distinct from my_firm())
  or exists (select 1 from room_members a join room_members b on a.room_id = b.room_id where a.user_id = auth.uid() and b.user_id = profiles.id)
);
-- 본인이 고칠 수 있는 칸만 (직책·부서·지점·역할은 어드민 함수로)
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy favorites_own on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy rooms_read on public.rooms for select to authenticated using (is_member(id));
create policy members_read on public.room_members for select to authenticated using (is_member(room_id));
-- 내 방 설정(고정·알림·숨김·읽음)만 직접 고침
create policy members_update_self on public.room_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy messages_read on public.messages for select to authenticated using (is_member(room_id));
create policy messages_send on public.messages for insert to authenticated with check (
  is_member(room_id) and sender_id = auth.uid() and sender_kind = 'user' and kind in ('text', 'contact')
  and not recalled and hearing_alert_id is null
);
create policy reactions_read on public.message_reactions for select to authenticated using (exists (select 1 from messages m where m.id = message_id and is_member(m.room_id)));
create policy reactions_own on public.message_reactions for all to authenticated using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id and is_member(m.room_id))
);
create policy hides_own on public.message_hides for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notices_read on public.room_notices for select to authenticated using (is_member(room_id));

create policy cases_read on public.cases for select to authenticated using (is_member(room_id));
create policy hearings_read on public.hearings for select to authenticated using (is_member(room_id));
create policy docs_read on public.case_documents for select to authenticated using (is_member(room_id));
create policy costs_read on public.case_costs for select to authenticated using (is_member(room_id));
create policy progress_read on public.case_progress for select to authenticated using (is_member(room_id));
create policy alerts_read on public.hearing_alerts for select to authenticated using (is_member(room_id));
create policy alert_recipients_read on public.hearing_alert_recipients for select to authenticated using (
  exists (select 1 from hearing_alerts a where a.id = alert_id and is_member(a.room_id))
);

-- 오픈대화방: 로펌 계정만. 비밀번호·실제 이용자는 숨김.
create policy open_rooms_read on public.open_rooms for select to authenticated using (is_firm());
create policy open_members_read on public.open_members for select to authenticated using (is_firm());
create policy open_messages_read on public.open_messages for select to authenticated using (open_member_id(room_id) is not null or is_super_admin());
create policy open_bans_read on public.open_bans for select to authenticated using (user_id = auth.uid());

-- 게시판: 볼 수 있는 게시판의 글만. 작성자 id는 숨기고 post_feed·comment_feed 보기로 내보냅니다.
create policy posts_read on public.posts for select to authenticated using (can_see_board(board));
create policy comments_read on public.comments for select to authenticated using (exists (select 1 from posts p where p.id = post_id and can_see_board(p.board)));
create policy post_votes_read on public.post_votes for select to authenticated using (exists (select 1 from posts p where p.id = post_id and can_see_board(p.board)));
create policy comment_votes_read on public.comment_votes for select to authenticated using (
  exists (select 1 from comments c join posts p on p.id = c.post_id where c.id = comment_id and can_see_board(p.board))
);
create policy reports_admin on public.reports for select to authenticated using (is_admin());
create policy bans_read on public.board_bans for select to authenticated using (user_id = auth.uid() or is_admin());
create policy notes_read on public.note_threads for select to authenticated using (a_id = auth.uid() or b_id = auth.uid());
create policy note_messages_read on public.note_messages for select to authenticated using (
  exists (select 1 from note_threads t where t.id = thread_id and (t.a_id = auth.uid() or t.b_id = auth.uid()))
);
create policy notice_seen_own on public.notice_seen for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy suggestions_read on public.suggestions for select to authenticated using (author_id = auth.uid() or is_super_admin());
create policy suggestions_write on public.suggestions for insert to authenticated with check (author_id = auth.uid() and status = 'open' and answer is null);
create policy auth_codes_read on public.auth_codes for select to authenticated using (user_id = auth.uid());
create policy auth_codes_read_flag on public.auth_codes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 익명 게시판 보기: 작성자는 '익명 N', 어드민에게만 실제 작성자. 실명 게시판은 프로필 id.
create view public.post_feed with (security_barrier) as
select
  p.id, p.board, p.field, p.title, p.body, p.notice, p.source_id, p.attachments, p.created_at, p.author_bot,
  (p.author_id = auth.uid()) as mine,
  case when p.board <> 'anon' or is_admin() then p.author_id end as author_id,
  coalesce((select sum(v.value) from post_votes v where v.post_id = p.id), 0)::int as score,
  (select count(*) from post_votes v where v.post_id = p.id and v.value = 1)::int as ups,
  (select count(*) from post_votes v where v.post_id = p.id and v.value = -1)::int as downs,
  (select v.value from post_votes v where v.post_id = p.id and v.user_id = auth.uid()) as my_vote,
  (select count(*) from comments c where c.post_id = p.id)::int as comment_count
from posts p
where can_see_board(p.board);

create view public.comment_feed with (security_barrier) as
select
  c.id, c.post_id, c.parent_id, case when c.deleted then '' else c.text end as text, c.deleted, c.created_at,
  (c.author_id = auth.uid()) as mine,
  case when p.board <> 'anon' or is_admin() then c.author_id end as author_id,
  (select a.alias_no from post_aliases a where a.post_id = c.post_id and a.user_id = c.author_id) as alias_no,
  coalesce((select sum(v.value) from comment_votes v where v.comment_id = c.id), 0)::int as score,
  (select count(*) from comment_votes v where v.comment_id = c.id and v.value = 1)::int as ups,
  (select count(*) from comment_votes v where v.comment_id = c.id and v.value = -1)::int as downs,
  (select v.value from comment_votes v where v.comment_id = c.id and v.user_id = auth.uid()) as my_vote
from comments c join posts p on p.id = c.post_id
where can_see_board(p.board);

-- 쪽지: 상대는 그 글의 익명 번호로 (실명 게시판·어드민은 실제 id)
create view public.note_feed with (security_barrier) as
select
  t.id, t.post_id,
  (select a.alias_no from post_aliases a where a.post_id = t.post_id and a.user_id = case when t.a_id = auth.uid() then t.b_id else t.a_id end) as other_alias_no,
  case when p.board <> 'anon' or is_admin() then case when t.a_id = auth.uid() then t.b_id else t.a_id end end as other_id,
  case when t.a_id = auth.uid() then t.a_read_at else t.b_read_at end as my_read_at
from note_threads t join posts p on p.id = t.post_id
where t.a_id = auth.uid() or t.b_id = auth.uid();

create view public.note_message_feed with (security_barrier) as
select m.id, m.thread_id, m.text, m.created_at, (m.sender_id = auth.uid()) as mine
from note_messages m join note_threads t on t.id = m.thread_id
where t.a_id = auth.uid() or t.b_id = auth.uid();

-- 오픈대화방 보기: 참여 중인 방의 메시지를 닉네임으로
create view public.open_message_feed with (security_barrier) as
select m.id, m.room_id, m.member_id, m.text, m.system, m.created_at, (m.member_id = open_member_id(m.room_id)) as mine
from open_messages m
where open_member_id(m.room_id) is not null or is_super_admin();

create view public.open_room_feed with (security_barrier) as
select r.id, r.title, r.description, r.tags, r.max_members, r.created_at, (r.password_hash is not null) as locked,
  (select count(*) from open_members m where m.room_id = r.id and m.left_at is null)::int as member_count,
  (open_member_id(r.id) is not null) as joined,
  exists (select 1 from open_bans b where b.room_id = r.id and b.user_id = auth.uid()) as banned
from open_rooms r
where is_firm();

-- ───────────────────────── 쓰기 함수 ─────────────────────────
-- 공통: 실패하면 '사람이 읽을 사유'로 예외를 냅니다.

create function public.board_guard(b public.board_kind) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not can_see_board(b) then raise exception '글을 찾을 수 없습니다.'; end if;
  if exists (select 1 from board_bans where user_id = auth.uid() and until > now()) then
    raise exception '게시판 이용이 제한되었습니다.';
  end if;
end $$;

create function public.alias_for(p uuid, u uuid) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select alias_no into n from post_aliases where post_id = p and user_id = u;
  if n is null then
    select coalesce(max(alias_no), 0) + 1 into n from post_aliases where post_id = p;
    insert into post_aliases (post_id, user_id, alias_no) values (p, u, n);
  end if;
  return n;
end $$;
revoke execute on function public.alias_for(uuid, uuid) from public, anon, authenticated;

create function public.create_post(p_board public.board_kind, p_title text, p_body text, p_field text default '', p_notice boolean default false, p_attachments jsonb default '[]', p_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; r public.role := me_role();
begin
  perform board_guard(p_board);
  if p_board = 'lawnews' then raise exception '자동 글만 올라오는 게시판입니다.'; end if;
  if (p_board = 'notice' or (p_board = 'skyzai' and p_notice)) and r <> 'admin' then raise exception '공지는 어드민만 올릴 수 있습니다.'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception '제목과 내용을 입력해 주세요.'; end if;
  if p_board in ('anon', 'lawyer', 'advice', 'praise') and coalesce(p_field, '') = '' then raise exception '분야를 골라 주세요.'; end if;
  if jsonb_array_length(p_attachments) > 5 then raise exception '첨부는 5개까지 올릴 수 있습니다.'; end if;
  insert into posts (id, board, author_id, field, title, body, notice, attachments)
  values (p_id, p_board, auth.uid(), coalesce(p_field, ''), trim(p_title), trim(p_body), p_board = 'skyzai' and p_notice, p_attachments)
  returning posts.id into id;
  perform alias_for(id, auth.uid());
  return id;
end $$;

create function public.comment_post(p_post uuid, p_text text, p_parent uuid default null, p_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path = public as $$
declare b public.board_kind; id uuid;
begin
  select board into b from posts where posts.id = p_post;
  if b is null then raise exception '글을 찾을 수 없습니다.'; end if;
  perform board_guard(b);
  if coalesce(trim(p_text), '') = '' then raise exception '댓글을 입력해 주세요.'; end if;
  if p_parent is not null and not exists (select 1 from comments where comments.id = p_parent and post_id = p_post) then raise exception '답글을 달 댓글을 찾을 수 없습니다.'; end if;
  insert into comments (id, post_id, author_id, parent_id, text) values (p_id, p_post, auth.uid(), p_parent, trim(p_text)) returning comments.id into id;
  perform alias_for(p_post, auth.uid());
  return id;
end $$;

create function public.vote_post(p_post uuid, p_value smallint) returns void language plpgsql security definer set search_path = public as $$
declare b public.board_kind; cur smallint;
begin
  select board into b from posts where id = p_post;
  if b is null then raise exception '글을 찾을 수 없습니다.'; end if;
  perform board_guard(b);
  select value into cur from post_votes where post_id = p_post and user_id = auth.uid();
  if cur = p_value then delete from post_votes where post_id = p_post and user_id = auth.uid();
  else insert into post_votes values (p_post, auth.uid(), p_value) on conflict (post_id, user_id) do update set value = excluded.value;
  end if;
end $$;

create function public.vote_comment(p_comment uuid, p_value smallint) returns void language plpgsql security definer set search_path = public as $$
declare b public.board_kind; cur smallint;
begin
  select p.board into b from comments c join posts p on p.id = c.post_id where c.id = p_comment;
  if b is null then raise exception '댓글을 찾을 수 없습니다.'; end if;
  perform board_guard(b);
  select value into cur from comment_votes where comment_id = p_comment and user_id = auth.uid();
  if cur = p_value then delete from comment_votes where comment_id = p_comment and user_id = auth.uid();
  else insert into comment_votes values (p_comment, auth.uid(), p_value) on conflict (comment_id, user_id) do update set value = excluded.value;
  end if;
end $$;

create function public.report_post(p_post uuid, p_reason text, p_comment uuid default null, p_id uuid default gen_random_uuid()) returns void language plpgsql security definer set search_path = public as $$
declare b public.board_kind;
begin
  select board into b from posts where id = p_post;
  if b is null then raise exception '글을 찾을 수 없습니다.'; end if;
  if not can_see_board(b) then raise exception '글을 찾을 수 없습니다.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '신고 사유를 골라 주세요.'; end if;
  if (case when p_comment is null then (select author_id from posts where id = p_post) else (select author_id from comments where id = p_comment and post_id = p_post) end) = auth.uid() then
    raise exception '내 글은 신고할 수 없습니다.';
  end if;
  insert into reports (id, post_id, comment_id, reporter_id, reason) values (p_id, p_post, p_comment, auth.uid(), p_reason);
exception when unique_violation then raise exception '이미 신고했습니다.';
end $$;

create function public.open_note(p_post uuid, p_to_comment uuid default null, p_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path = public as $$
-- 상대는 id 대신 글(p_to_comment가 없으면 글쓴이) 또는 댓글로 가리킵니다. 익명 게시판에서 상대 id가 드러나지 않도록.
declare b public.board_kind; other uuid; t uuid;
begin
  select board, author_id into b, other from posts where id = p_post;
  if b is null then raise exception '글을 찾을 수 없습니다.'; end if;
  perform board_guard(b);
  if p_to_comment is not null then select author_id into other from comments where id = p_to_comment and post_id = p_post; end if;
  if other is null then raise exception '쪽지를 보낼 수 없는 상대입니다.'; end if;
  if other = auth.uid() then raise exception '내 글에는 쪽지를 보낼 수 없습니다.'; end if;
  select id into t from note_threads where post_id = p_post and ((a_id = auth.uid() and b_id = other) or (a_id = other and b_id = auth.uid()));
  if t is null then insert into note_threads (id, post_id, a_id, b_id) values (p_id, p_post, auth.uid(), other) returning id into t; end if;
  perform alias_for(p_post, auth.uid());
  perform alias_for(p_post, other);
  return t;
end $$;

create function public.send_note(p_thread uuid, p_text text, p_id uuid default gen_random_uuid()) returns void language plpgsql security definer set search_path = public as $$
declare b public.board_kind;
begin
  select p.board into b from note_threads t join posts p on p.id = t.post_id where t.id = p_thread and (t.a_id = auth.uid() or t.b_id = auth.uid());
  if b is null then raise exception '쪽지를 찾을 수 없습니다.'; end if;
  perform board_guard(b);
  if coalesce(trim(p_text), '') = '' then raise exception '쪽지를 입력해 주세요.'; end if;
  insert into note_messages (id, thread_id, sender_id, text) values (p_id, p_thread, auth.uid(), trim(p_text));
  update note_threads set a_read_at = case when a_id = auth.uid() then now() else a_read_at end, b_read_at = case when b_id = auth.uid() then now() else b_read_at end where id = p_thread;
end $$;

create function public.read_note(p_thread uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update note_threads set a_read_at = case when a_id = auth.uid() then now() else a_read_at end, b_read_at = case when b_id = auth.uid() then now() else b_read_at end
  where id = p_thread and (a_id = auth.uid() or b_id = auth.uid());
end $$;

-- 어드민: 글·댓글 삭제, 이용 제한, 신고 처리
create function public.admin_delete_post(p_post uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 삭제할 수 있습니다.'; end if;
  update reports set status = 'resolved', resolution = '글 삭제' where post_id = p_post and status = 'open';
  delete from posts where id = p_post;
end $$;
create function public.admin_delete_comment(p_comment uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 삭제할 수 있습니다.'; end if;
  update comments set deleted = true, text = '' where id = p_comment;
  update reports set status = 'resolved', resolution = '댓글 삭제' where comment_id = p_comment and status = 'open';
end $$;
create function public.admin_restrict(p_post uuid, p_comment uuid, p_hours int) returns void language plpgsql security definer set search_path = public as $$
-- 대상 사람을 글·댓글로 가리킵니다 (어드민 화면에도 익명 게시판 작성자 id를 넘기지 않기 위해)
declare u uuid;
begin
  if not is_admin() then raise exception '어드민만 제한할 수 있습니다.'; end if;
  if p_comment is not null then select author_id into u from comments where id = p_comment; else select author_id into u from posts where id = p_post; end if;
  if u is null or u = auth.uid() then raise exception '제한할 수 없는 대상입니다.'; end if;
  insert into board_bans values (u, now() + make_interval(hours => p_hours)) on conflict (user_id) do update set until = excluded.until;
end $$;
create function public.admin_lift_restriction(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 해제할 수 있습니다.'; end if;
  delete from board_bans where user_id = p_user;
end $$;
create function public.admin_close_report(p_report uuid, p_status public.report_status, p_resolution text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 처리할 수 있습니다.'; end if;
  update reports set status = p_status, resolution = p_resolution where id = p_report;
end $$;

-- 공지 확인, 건의사항 답변
create function public.answer_suggestion(p_id uuid, p_status public.suggestion_status, p_answer text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception '관리자어드민만 처리할 수 있습니다.'; end if;
  update suggestions set status = p_status, answer = nullif(trim(p_answer), ''), answered_at = case when nullif(trim(p_answer), '') is null then answered_at else now() end where id = p_id;
end $$;

-- 대화방: 보낼 때 읽음 처리
create function public.on_message_sent() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sender_kind = 'user' then
    update room_members set last_read_at = greatest(coalesce(last_read_at, new.created_at), new.created_at) where room_id = new.room_id and user_id = new.sender_id;
  end if;
  update room_members set hidden_at = null where room_id = new.room_id and hidden_at is not null;
  return new;
end $$;
create trigger message_sent after insert on public.messages for each row execute function public.on_message_sent();

-- 회수: 보낸 사람만
create function public.recall_message(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update messages set recalled = true, text = '' where id = p_id and sender_id = auth.uid();
  if not found then raise exception '회수할 수 없는 메시지입니다.'; end if;
end $$;

-- 볼 수 있는 사람인지 (profiles_read 규칙과 같음). 방 만들기·초대 대상 확인용
create function public.can_see_profile(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles t where t.id = p_user and t.active and (
      t.id = auth.uid() or is_admin()
      or (is_firm() and t.role <> 'client' and t.firm is not distinct from my_firm())
      or exists (select 1 from room_members a join room_members b on a.room_id = b.room_id where a.user_id = auth.uid() and b.user_id = t.id)
    )
  )
$$;

create function public.is_room_master(r uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = r and user_id = auth.uid() and is_master)
$$;

-- 메시지 올리기. 사람 메시지는 보낸 사람이 나, 시스템·봇·AI 메시지는 앱의 안내문이며 올린 사람을 origin_id로 남깁니다.
-- (기일 알람 카드는 sync_hearing만 만듭니다)
create function public.post_message(
  p_id uuid, p_room uuid, p_kind public.message_kind, p_text text,
  p_reply_to uuid default null, p_forward_of jsonb default null, p_bundle jsonb default null,
  p_mentions text[] default '{}', p_contact uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare m public.room_mode;
begin
  if me_role() is null or not is_member(p_room) then raise exception '참여 중인 방이 아닙니다.'; end if;
  select mode into m from rooms where id = p_room;
  if p_kind = 'ai' and m <> 'ai' then raise exception '사건수행방에는 AI가 참여하지 않습니다.'; end if;
  if p_kind = 'contact' and (p_contact is null or not can_see_profile(p_contact)) then raise exception '연락처를 찾을 수 없습니다.'; end if;
  if p_reply_to is not null and not exists (select 1 from messages where id = p_reply_to and room_id = p_room) then raise exception '답장할 메시지를 찾을 수 없습니다.'; end if;
  if p_kind in ('text', 'contact') and coalesce(trim(p_text), '') = '' then raise exception '메시지를 입력해 주세요.'; end if;
  insert into messages (id, room_id, sender_id, sender_kind, kind, text, reply_to, forward_of, bundle, mentions, contact_id, origin_id)
  values (
    p_id, p_room,
    case when p_kind in ('text', 'contact') then auth.uid() end,
    case p_kind when 'ai' then 'ai' when 'bot' then 'bot' when 'system' then 'system' else 'user' end::public.sender_kind,
    p_kind, coalesce(p_text, ''), p_reply_to, p_forward_of, p_bundle, coalesce(p_mentions, '{}'),
    case when p_kind = 'contact' then p_contact end,
    case when p_kind not in ('text', 'contact') then auth.uid() end
  );
end $$;

-- 방 만들기 (메신저). 상담·사건방은 open_lawyer_room으로만.
create function public.create_room(p_id uuid, p_kind public.room_kind, p_mode public.room_mode, p_title text, p_members uuid[]) returns uuid language plpgsql security definer set search_path = public as $$
declare r public.role := me_role(); others uuid[];
begin
  if r is null then raise exception '다시 로그인해 주세요.'; end if;
  if p_kind in ('consult', 'case') then raise exception '상담·사건방은 찾기에서 엽니다.'; end if;
  if p_kind in ('meeting', 'marketing') and p_mode <> 'ai' then raise exception '이 방은 AI 참여방으로만 만들 수 있습니다.'; end if;
  if p_kind in ('office', 'meeting', 'marketing') and r = 'client' then raise exception '업무용 방은 로펌 구성원만 만들 수 있습니다.'; end if;
  if p_kind in ('meeting', 'marketing') and not can_use_agents() then raise exception '에이전트 방은 어드민이 허용한 사용자만 만들 수 있습니다.'; end if;
  select coalesce(array_agg(distinct u), '{}') into others from unnest(coalesce(p_members, '{}')) u where u <> auth.uid();
  if p_kind = 'direct' and cardinality(others) <> 1 then raise exception '1:1 대화는 상대 한 명을 골라 주세요.'; end if;
  if exists (select 1 from unnest(others) u where not can_see_profile(u)) then raise exception '초대할 수 없는 사람이 있습니다.'; end if;
  insert into rooms (id, kind, mode, title, created_by) values (p_id, p_kind, p_mode, coalesce(nullif(trim(p_title), ''), '새 대화'), auth.uid());
  insert into room_members (room_id, user_id, is_master, joined_at) values (p_id, auth.uid(), true, now());
  insert into room_members (room_id, user_id, joined_at)
  select p_id, u, now() + make_interval(secs => o / 1e6) from unnest(others) with ordinality as x(u, o);
  return p_id;
end $$;

-- 찾기에서 고른 변호사와의 상담·수임 요청 (의뢰인). 사건수행방으로만 열립니다.
create function public.open_lawyer_room(p_id uuid, p_kind public.room_kind, p_title text, p_office text, p_lawyer text, p_field text default '', p_progress_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if me_role() is distinct from 'client' then raise exception '의뢰인 계정에서만 상담을 신청할 수 있습니다.'; end if;
  if p_kind not in ('consult', 'case') then raise exception '상담·사건방만 열 수 있습니다.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '방 이름이 없습니다.'; end if;
  insert into rooms (id, kind, mode, title, created_by, office_id, lawyer_id) values (p_id, p_kind, 'private', trim(p_title), auth.uid(), p_office, p_lawyer);
  insert into room_members (room_id, user_id, is_master) values (p_id, auth.uid(), true);
  if p_kind = 'case' then
    insert into cases (room_id, title, field, stage) values (p_id, trim(p_title), coalesce(p_field, ''), '수임');
    insert into case_progress (id, room_id, note) values (p_progress_id, p_id, '수임 요청');
  end if;
  return p_id;
end $$;

create function public.add_members(p_room uuid, p_users uuid[]) returns void language plpgsql security definer set search_path = public as $$
declare k public.room_kind;
begin
  if not is_member(p_room) then raise exception '참여 중인 방이 아닙니다.'; end if;
  select kind into k from rooms where id = p_room;
  if k in ('direct', 'consult', 'case') then raise exception '이 방에는 초대할 수 없습니다.'; end if;
  if exists (select 1 from unnest(p_users) u where not can_see_profile(u)) then raise exception '초대할 수 없는 사람이 있습니다.'; end if;
  insert into room_members (room_id, user_id, joined_at)
  select p_room, u, now() + make_interval(secs => o / 1e6) from unnest(p_users) with ordinality as x(u, o)
  on conflict do nothing;
end $$;

create function public.kick_member(p_room uuid, p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_room_master(p_room) then raise exception '마스터만 내보낼 수 있습니다.'; end if;
  if p_user = auth.uid() then raise exception '나 자신은 내보낼 수 없습니다. 나가기를 이용해 주세요.'; end if;
  if exists (select 1 from rooms where id = p_room and kind in ('case', 'consult')) then raise exception '상담·사건방에서는 참여자를 내보낼 수 없습니다.'; end if;
  delete from room_members where room_id = p_room and user_id = p_user;
  if not found then raise exception '대화 참여자가 아닙니다.'; end if;
end $$;

create function public.set_master(p_room uuid, p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_room_master(p_room) then raise exception '마스터만 할 수 있습니다.'; end if;
  update room_members set is_master = p_on where room_id = p_room and user_id = p_user;
  if not found then raise exception '대화 참여자만 마스터가 될 수 있습니다.'; end if;
  if not exists (select 1 from room_members where room_id = p_room and is_master) then raise exception '마스터는 한 명 이상 있어야 합니다.'; end if;
end $$;

-- 나가기. 마지막 마스터가 나가면 남은 사람 중 먼저 들어온 사람이 마스터가 됩니다.
create function public.leave_room(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rooms where id = p_room and kind in ('case', 'consult')) then raise exception '상담·사건방은 나갈 수 없습니다.'; end if;
  delete from room_members where room_id = p_room and user_id = auth.uid();
  if not found then raise exception '참여 중인 방이 아닙니다.'; end if;
  if not exists (select 1 from room_members where room_id = p_room and is_master) then
    update room_members set is_master = true
    where room_id = p_room and user_id = (select user_id from room_members where room_id = p_room order by joined_at, user_id limit 1);
  end if;
end $$;

-- 읽음: 서버 시각 기준으로 방의 마지막 메시지까지
create function public.mark_read(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update room_members set last_read_at = greatest(coalesce(last_read_at, '-infinity'), (select max(created_at) from messages where room_id = p_room))
  where room_id = p_room and user_id = auth.uid() and exists (select 1 from messages where room_id = p_room);
end $$;

-- 공지 (방 참여자 누구나, 최근 5개까지)
create function public.set_notice(p_id uuid, p_room uuid, p_message uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_room) then raise exception '참여 중인 방이 아닙니다.'; end if;
  if not exists (select 1 from messages where id = p_message and room_id = p_room and not recalled) then raise exception '공지로 올릴 수 없는 메시지입니다.'; end if;
  delete from room_notices where room_id = p_room and message_id = p_message;
  insert into room_notices (id, room_id, message_id, text, by_id) values (p_id, p_room, p_message, p_text, auth.uid());
  delete from room_notices where room_id = p_room and id not in (select id from room_notices where room_id = p_room order by created_at desc limit 5);
  update room_members set notice_hidden = false where room_id = p_room;
end $$;

create function public.remove_notice(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from room_notices where id = p_id and is_member(room_id);
end $$;

-- 사건: 상담방을 사건방으로, 기록 추가, 단계 변경 (담당 변호사·직원)
create function public.case_guard(p_room uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_firm() and is_member(p_room)) then raise exception '담당 변호사·직원만 바꿀 수 있습니다.'; end if;
end $$;

create function public.promote_case(p_room uuid, p_title text, p_field text, p_progress_id uuid default gen_random_uuid()) returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  perform case_guard(p_room);
  if not exists (select 1 from rooms where id = p_room and kind = 'consult') then raise exception '상담방만 사건방으로 올릴 수 있습니다.'; end if;
  if not exists (select 1 from room_members m join profiles p on p.id = m.user_id where m.room_id = p_room and p.role = 'lawyer') then
    raise exception '담당 변호사가 방에 있어야 수임할 수 있습니다.';
  end if;
  select coalesce(nullif(trim(p_title), ''), title) into t from rooms where id = p_room;
  update rooms set kind = 'case', title = t where id = p_room;
  insert into cases (room_id, title, field, stage) values (p_room, t, coalesce(p_field, ''), '수임');
  insert into case_progress (id, room_id, note) values (p_progress_id, p_room, '수임');
end $$;

create function public.add_case_entry(p_id uuid, p_room uuid, p_type text, p_label text, p_amount bigint default 0) returns void language plpgsql security definer set search_path = public as $$
begin
  perform case_guard(p_room);
  if not exists (select 1 from cases where room_id = p_room) then raise exception '사건방에서만 쓸 수 있습니다.'; end if;
  if coalesce(trim(p_label), '') = '' then raise exception '내용을 적어 주세요.'; end if;
  if p_type = 'document' then insert into case_documents (id, room_id, name) values (p_id, p_room, trim(p_label));
  elsif p_type = 'cost' then insert into case_costs (id, room_id, label, amount) values (p_id, p_room, trim(p_label), coalesce(p_amount, 0));
  elsif p_type = 'progress' then insert into case_progress (id, room_id, note) values (p_id, p_room, trim(p_label));
  else raise exception '알 수 없는 기록입니다.';
  end if;
end $$;

create function public.set_case_stage(p_room uuid, p_stage public.case_stage) returns void language plpgsql security definer set search_path = public as $$
begin
  perform case_guard(p_room);
  update cases set stage = p_stage where room_id = p_room;
  if not found then raise exception '사건방에서만 쓸 수 있습니다.'; end if;
end $$;

-- 기일 업데이트 (변호사 입력). 대륜탑 연동은 서버(service role)에서 같은 함수를 대신 부릅니다.
-- 앱에서 부를 때는 알람·카드·공지·진행 기록의 id와 문구를 앱이 정해 넘깁니다 (화면과 서버가 같은 id를 씀).
create function public.sync_hearing(
  p_room uuid, p_change public.hearing_change, p_label text, p_date date, p_time time default null, p_place text default null,
  p_hearing uuid default null, p_source public.hearing_source default 'manual',
  p_new_hearing_id uuid default gen_random_uuid(), p_alert_id uuid default gen_random_uuid(), p_message_id uuid default gen_random_uuid(),
  p_notice_id uuid default gen_random_uuid(), p_notice_text text default null, p_progress_id uuid default gen_random_uuid(), p_progress_note text default null,
  p_recipients uuid[] default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare prev hearings; h uuid; caller uuid := auth.uid();
begin
  if not exists (select 1 from cases where room_id = p_room) then raise exception '사건방에서만 기일을 올릴 수 있습니다.'; end if;
  if caller is not null then
    -- 관리자어드민의 '대륜탑 기일 연동 시연'만 예외
    if p_source <> 'manual' and not is_super_admin() then raise exception '대륜탑 연동은 서버에서만 올립니다.'; end if;
    if p_source = 'manual' and not (is_firm() and is_member(p_room)) then raise exception '담당 변호사·직원만 기일을 바꿀 수 있습니다.'; end if;
  end if;
  if coalesce(trim(p_label), '') = '' then raise exception '기일 이름을 적어 주세요.'; end if;
  if p_hearing is not null then select * into prev from hearings where id = p_hearing and room_id = p_room; end if;
  if p_change <> 'new' and prev.id is null then raise exception '바꿀 기일을 찾을 수 없습니다.'; end if;
  if p_change = 'cancelled' then delete from hearings where id = prev.id; h := prev.id;
  elsif prev.id is not null then update hearings set label = trim(p_label), date = p_date, time = p_time, place = nullif(trim(p_place), ''), source = p_source where id = prev.id; h := prev.id;
  else insert into hearings (id, room_id, label, date, time, place, source) values (p_new_hearing_id, p_room, trim(p_label), p_date, p_time, nullif(trim(p_place), ''), p_source) returning id into h;
  end if;
  insert into messages (id, room_id, sender_kind, kind, hearing_alert_id, origin_id) values (p_message_id, p_room, 'bot', 'bot', p_alert_id, caller);
  insert into hearing_alerts (id, room_id, hearing_id, change, label, date, time, place, prev_date, prev_time, source, message_id)
  values (p_alert_id, p_room, h, p_change, trim(p_label), p_date, p_time, nullif(trim(p_place), ''), prev.date, prev.time, p_source, p_message_id);
  insert into hearing_alert_recipients (alert_id, user_id, acked_at)
  select p_alert_id, m.user_id, case when m.user_id = caller and p_source = 'manual' then now() end
  from room_members m where m.room_id = p_room and (p_recipients is null or m.user_id = any (p_recipients));
  delete from room_notices where room_id = p_room and by_bot;
  insert into room_notices (id, room_id, message_id, text, by_bot) values (p_notice_id, p_room, p_message_id, coalesce(p_notice_text, trim(p_label) || ' ' || p_date), true);
  delete from room_notices where room_id = p_room and id not in (select id from room_notices where room_id = p_room order by created_at desc limit 5);
  update room_members set notice_hidden = false where room_id = p_room;
  insert into case_progress (id, room_id, note) values (p_progress_id, p_room, coalesce(p_progress_note, p_change || ': ' || trim(p_label) || ' ' || p_date));
  return p_alert_id;
end $$;

-- '확인했습니다'. 방에 남는 확인 기록 메시지는 앱이 post_message로 올립니다.
create function public.ack_hearing(p_alert uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update hearing_alert_recipients set acked_at = now() where alert_id = p_alert and user_id = auth.uid() and acked_at is null;
  if not found and not exists (select 1 from hearing_alert_recipients where alert_id = p_alert and user_id = auth.uid()) then
    raise exception '확인할 기일 알람이 없습니다.';
  end if;
end $$;

-- 오픈대화방
create function public.open_alias_guard(p_alias text) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(trim(p_alias), '') = '' then raise exception '닉네임을 입력해 주세요.'; end if;
  if char_length(trim(p_alias)) > 12 then raise exception '닉네임은 12자 이내로 적어 주세요.'; end if;
  if trim(p_alias) = (select nickname from profiles where id = auth.uid()) then raise exception '실명과 다른 닉네임을 써 주세요.'; end if;
end $$;

create function public.create_open_room(p_title text, p_description text, p_tags text[], p_max int, p_alias text, p_password text default null, p_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not is_firm() then raise exception '오픈대화방을 쓸 수 없는 계정입니다.'; end if;
  perform open_alias_guard(p_alias);
  if coalesce(trim(p_title), '') = '' then raise exception '방 이름을 입력해 주세요.'; end if;
  if p_password is not null and p_password !~ '^\S{4,16}$' then raise exception '비밀번호는 띄어쓰기 없이 4~16자로 정해 주세요.'; end if;
  insert into open_rooms (id, title, description, tags, max_members, password_hash)
  values (p_id, trim(p_title), left(coalesce(trim(p_description), ''), 200), coalesce(p_tags, '{}'), p_max, case when p_password is null then null else extensions.crypt(p_password, extensions.gen_salt('bf')) end);
  insert into open_members (room_id, user_id, alias, is_host) values (p_id, auth.uid(), trim(p_alias), true);
  insert into open_messages (room_id, text, system) values (p_id, trim(p_alias) || '님이 방을 만들었습니다.', true);
  return p_id;
end $$;

create function public.join_open_room(p_room uuid, p_alias text, p_password text default '') returns void language plpgsql security definer set search_path = public as $$
declare rr open_rooms;
begin
  select * into rr from open_rooms where id = p_room;
  if rr.id is null or not is_firm() then raise exception '들어갈 수 없는 방입니다.'; end if;
  if open_member_id(p_room) is not null then return; end if;
  if exists (select 1 from open_bans where room_id = p_room and user_id = auth.uid()) then raise exception '방장이 내보낸 방에는 다시 들어갈 수 없습니다.'; end if;
  if (select count(*) from open_members where room_id = p_room and left_at is null) >= rr.max_members then raise exception '방이 가득 찼습니다.'; end if;
  if rr.password_hash is not null and rr.password_hash <> extensions.crypt(coalesce(p_password, ''), rr.password_hash) then raise exception '비밀번호가 맞지 않습니다.'; end if;
  perform open_alias_guard(p_alias);
  insert into open_members (room_id, user_id, alias) values (p_room, auth.uid(), trim(p_alias));
  insert into open_messages (room_id, text, system) values (p_room, trim(p_alias) || '님이 들어왔습니다.', true);
exception when unique_violation then raise exception '이 방에서 이미 쓰는 닉네임입니다.';
end $$;

create function public.send_open(p_room uuid, p_text text, p_id uuid default gen_random_uuid()) returns void language plpgsql security definer set search_path = public as $$
declare m uuid := open_member_id(p_room);
begin
  if m is null then raise exception '참여 중인 방이 아닙니다.'; end if;
  if coalesce(trim(p_text), '') = '' then return; end if;
  insert into open_messages (id, room_id, member_id, text) values (p_id, p_room, m, trim(p_text));
end $$;

-- 참여자가 빠진 뒤: 아무도 없으면 방을 없애고, 방장이 없으면 가장 먼저 들어온 사람이 방장
create function public.open_after_leave(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
declare nxt open_members;
begin
  if not exists (select 1 from open_members where room_id = p_room and left_at is null) then delete from open_rooms where id = p_room; return; end if;
  if not exists (select 1 from open_members where room_id = p_room and left_at is null and is_host) then
    select * into nxt from open_members where room_id = p_room and left_at is null order by joined_at, id limit 1;
    update open_members set is_host = true where id = nxt.id;
    insert into open_messages (room_id, text, system) values (p_room, nxt.alias || '님이 방장이 되었습니다.', true);
  end if;
end $$;
revoke execute on function public.open_after_leave(uuid) from public, anon, authenticated;

create function public.leave_open_room(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
declare m open_members;
begin
  select * into m from open_members where id = open_member_id(p_room);
  if m.id is null then raise exception '참여 중인 방이 아닙니다.'; end if;
  update open_members set left_at = now(), is_host = false where id = m.id;
  insert into open_messages (room_id, text, system) values (p_room, m.alias || '님이 나갔습니다.', true);
  perform open_after_leave(p_room);
end $$;

-- 방장 또는 관리자어드민: 내보내기 (다시 못 들어옴). 대상은 참여자 번호로.
create function public.kick_open(p_room uuid, p_member uuid) returns void language plpgsql security definer set search_path = public as $$
declare t open_members; host boolean := exists (select 1 from open_members where id = open_member_id(p_room) and is_host);
begin
  if not host and not is_super_admin() then raise exception '방장만 내보낼 수 있습니다.'; end if;
  select * into t from open_members where id = p_member and room_id = p_room and left_at is null;
  if t.id is null or t.user_id = auth.uid() then raise exception '내보낼 수 없는 참여자입니다.'; end if;
  update open_members set left_at = now(), is_host = false where id = t.id;
  insert into open_bans values (p_room, t.user_id) on conflict do nothing;
  insert into open_messages (room_id, text, system) values (p_room, case when host then '방장' else '관리자' end || '이 ' || t.alias || '님을 내보냈습니다.', true);
  perform open_after_leave(p_room);
end $$;

create function public.set_open_password(p_room uuid, p_password text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from open_members where id = open_member_id(p_room) and is_host) then raise exception '방장만 비밀번호를 바꿀 수 있습니다.'; end if;
  if coalesce(p_password, '') <> '' and p_password !~ '^\S{4,16}$' then raise exception '비밀번호는 띄어쓰기 없이 4~16자로 정해 주세요.'; end if;
  update open_rooms set password_hash = case when coalesce(p_password, '') = '' then null else extensions.crypt(p_password, extensions.gen_salt('bf')) end where id = p_room;
end $$;

create function public.delete_open_room(p_room uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from open_members where id = open_member_id(p_room) and is_host) and not is_super_admin() then raise exception '방장만 방을 없앨 수 있습니다.'; end if;
  delete from open_rooms where id = p_room;
end $$;

-- 내가 참여 중인 방의 내 참여자 번호 (화면에서 '나'를 알아보는 용도)
create function public.my_open_members() returns table (room_id uuid, member_id uuid) language sql stable security definer set search_path = public as $$
  select room_id, id from open_members where user_id = auth.uid() and left_at is null
$$;

-- 관리자어드민만: 닉네임 뒤 실제 이용자 (p_room이 없으면 모든 방)
create function public.open_room_identities(p_room uuid default null) returns table (member_id uuid, room_id uuid, user_id uuid, nickname text, title text, role public.role) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception '관리자어드민만 볼 수 있습니다.'; end if;
  return query select m.id, m.room_id, p.id, p.nickname, p.title, p.role from open_members m join profiles p on p.id = m.user_id where p_room is null or m.room_id = p_room;
end $$;

-- 로그인 기록 (백오피스 '마지막 로그인'). 중지된 계정이면 false
create function public.touch_login() returns boolean language plpgsql security definer set search_path = public as $$
begin
  update profiles set last_login_at = now() where id = auth.uid() and active;
  return found;
end $$;

-- 어드민: 계정 정보 (계정 만들기·비밀번호 초기화는 서버 함수 admin-accounts에서)
create function public.admin_guard_target(p_user uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 바꿀 수 있습니다.'; end if;
  if exists (select 1 from profiles where id = p_user and role = 'admin' and super_admin) and not is_super_admin() then
    raise exception '관리자어드민 계정은 관리자어드민만 바꿀 수 있습니다.';
  end if;
end $$;

create function public.admin_set_role(p_user uuid, p_role public.role) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard_target(p_user);
  if p_user = auth.uid() then raise exception '내 역할은 바꿀 수 없습니다.'; end if;
  update profiles set role = p_role, agent_access = case when p_role = 'client' then false else agent_access end, super_admin = super_admin and p_role = 'admin' where id = p_user;
end $$;

create function public.admin_set_active(p_user uuid, p_active boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard_target(p_user);
  if p_user = auth.uid() then raise exception '내 계정은 중지할 수 없습니다.'; end if;
  update profiles set active = p_active where id = p_user;
end $$;

create function public.admin_set_agent_access(p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard_target(p_user);
  update profiles set agent_access = p_on where id = p_user and role in ('lawyer', 'staff');
  if not found then raise exception '로펌 구성원에게만 허용할 수 있습니다.'; end if;
end $$;

create function public.admin_set_titles(p_users uuid[], p_title text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '어드민만 바꿀 수 있습니다.'; end if;
  update profiles set title = nullif(trim(p_title), '') where id = any (p_users) and role <> 'client';
end $$;

create function public.admin_set_super_admin(p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception '관리자어드민만 지정할 수 있습니다.'; end if;
  if not exists (select 1 from profiles where id = p_user and role = 'admin') then raise exception '어드민 계정만 관리자어드민이 될 수 있습니다.'; end if;
  if not p_on and (select count(*) from profiles where role = 'admin' and super_admin and active) <= 1 and (select super_admin from profiles where id = p_user) then
    raise exception '관리자어드민은 한 명 이상 있어야 합니다.';
  end if;
  update profiles set super_admin = p_on where id = p_user;
end $$;

-- ───────────────────────── 권한 ─────────────────────────
-- 'Automatically expose new tables'를 끈 프로젝트 기준입니다. 켜져 있어도 같은 결과가 되도록 먼저 모두 거둡니다.
-- 로그인 안 한 사람(anon)에게는 아무것도 열지 않습니다.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 읽기: 행 보안이 걸린 표 전체
grant select on
  public.profiles, public.favorites, public.rooms, public.room_members, public.messages, public.message_reactions,
  public.message_hides, public.room_notices, public.cases, public.hearings, public.case_documents, public.case_costs,
  public.case_progress, public.hearing_alerts, public.hearing_alert_recipients, public.open_bans, public.open_messages,
  public.reports, public.board_bans, public.notice_seen, public.suggestions, public.auth_codes
to authenticated;
-- 읽기: 숨길 칸이 있는 표는 보여도 되는 칸만
grant select (id, title, description, tags, max_members, created_at) on public.open_rooms to authenticated;
grant select (id, room_id, alias, is_host, joined_at, left_at) on public.open_members to authenticated;
grant select (id, board, author_bot, field, title, body, notice, source_id, attachments, created_at) on public.posts to authenticated;
grant select (id, post_id, parent_id, text, deleted, created_at) on public.comments to authenticated;
grant select (post_id, value) on public.post_votes to authenticated;
grant select (comment_id, value) on public.comment_votes to authenticated;
grant select (id, post_id, a_read_at, b_read_at) on public.note_threads to authenticated;
grant select (id, thread_id, text, created_at) on public.note_messages to authenticated;
grant select on public.post_feed, public.comment_feed, public.note_feed, public.note_message_feed, public.open_message_feed, public.open_room_feed to authenticated;

-- 쓰기: 본인 칸만 (행 보안이 한 번 더 막음)
grant update (nickname, photo_path, status, phone, email, birthday, presence) on public.profiles to authenticated;
grant update (pinned, notify, hidden_at, last_read_at, notice_hidden) on public.room_members to authenticated;
grant update (read) on public.auth_codes to authenticated;
grant insert on public.messages, public.suggestions to authenticated;
grant insert, update, delete on public.favorites, public.message_reactions, public.message_hides, public.notice_seen to authenticated;

-- 서버(관리자 키)는 전부. 대륜탑 연동·계정 관리 함수가 씁니다.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- 함수는 로그인한 사람과 서버만 부릅니다
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.alias_for(uuid, uuid), public.open_after_leave(uuid) from authenticated;
