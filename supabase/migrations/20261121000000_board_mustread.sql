-- 게시판 필독 + 읽은 사람 (2026-11-21) — 네이버웍스 게시판의 필독·읽은 멤버 목록.
--
-- posts.must_read_until : 이 날까지 꼭 읽어야 하는 글. 글쓴이(공지는 어드민)가 정함.
-- post_reads            : 누가 언제 읽었나. 글을 열면 앱이 mark_post_read 를 부름.
-- post_feed             : read_count(읽은 수)·read_by_me(내가 읽었나)·must_read_until 을 함께 내려 줌.

alter table public.posts add column if not exists must_read_until date;

create table public.post_reads (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_reads enable row level security;
create policy post_reads_mine on public.post_reads for select to authenticated using (user_id = auth.uid());
-- 읽은 사람 목록은 RPC(post_readers)로만 (글쓴이·어드민)

-- 피드 다시 만들기 (열 추가)
drop view if exists public.post_feed;
create view public.post_feed with (security_barrier) as
select
  p.id, p.board, p.field, p.title, p.body, p.notice, p.source_id, p.attachments, p.created_at, p.author_bot, p.must_read_until,
  (p.author_id = auth.uid()) as mine,
  case when p.board <> 'anon' or is_admin() then p.author_id end as author_id,
  coalesce((select sum(v.value) from post_votes v where v.post_id = p.id), 0)::int as score,
  (select count(*) from post_votes v where v.post_id = p.id and v.value = 1)::int as ups,
  (select count(*) from post_votes v where v.post_id = p.id and v.value = -1)::int as downs,
  (select v.value from post_votes v where v.post_id = p.id and v.user_id = auth.uid()) as my_vote,
  (select count(*) from comments c where c.post_id = p.id)::int as comment_count,
  (select count(*) from post_reads r where r.post_id = p.id)::int as read_count,
  exists (select 1 from post_reads r where r.post_id = p.id and r.user_id = auth.uid()) as read_by_me
from posts p
where can_see_board(p.board);
grant select on public.post_feed to authenticated;

-- 글쓰기: 필독 기한 받기 (익명 게시판은 필독 없음). 20261020 의 정의(첨부 경로 확인·자동 게시판 차단)를 그대로 잇습니다.
drop function if exists public.create_post(public.board_kind, text, text, text, boolean, jsonb, uuid);
create function public.create_post(p_board public.board_kind, p_title text, p_body text, p_field text default '', p_notice boolean default false, p_attachments jsonb default '[]', p_id uuid default gen_random_uuid(), p_must_read_until date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; r public.role := me_role(); atts jsonb := coalesce(p_attachments, '[]');
begin
  perform board_guard(p_board);
  if p_board::text in ('lawnews', 'deadline') then raise exception '자동 글만 올라오는 게시판입니다.'; end if;
  if (p_board = 'notice' or (p_board = 'skyzai' and p_notice)) and r <> 'admin' then raise exception '공지는 어드민만 올릴 수 있습니다.'; end if;
  if p_must_read_until is not null and p_board = 'anon' then raise exception '익명 게시판에는 필독을 걸 수 없습니다.'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception '제목과 내용을 입력해 주세요.'; end if;
  if p_board in ('anon', 'lawyer', 'advice', 'praise') and coalesce(p_field, '') = '' then raise exception '분야를 골라 주세요.'; end if;
  if jsonb_array_length(atts) > 5 then raise exception '첨부는 5개까지 올릴 수 있습니다.'; end if;
  if not post_attachments_ok(p_id, atts) then raise exception '첨부를 올릴 수 없습니다.'; end if;
  insert into posts (id, board, author_id, field, title, body, notice, attachments, must_read_until)
  values (p_id, p_board, auth.uid(), coalesce(p_field, ''), trim(p_title), trim(p_body), p_board = 'skyzai' and p_notice, atts, p_must_read_until)
  returning posts.id into id;
  perform alias_for(id, auth.uid());
  return id;
end $$;
grant execute on function public.create_post(public.board_kind, text, text, text, boolean, jsonb, uuid, date) to authenticated;

-- 읽음 표시 (글을 열 때)
create function public.mark_post_read(p_post uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from posts p where p.id = p_post and can_see_board(p.board)) then raise exception '글을 찾을 수 없습니다.'; end if;
  insert into post_reads (post_id, user_id) values (p_post, auth.uid()) on conflict do nothing;
end $$;
grant execute on function public.mark_post_read(uuid) to authenticated;

-- 읽은 사람 목록: 글쓴이·어드민만. 익명 게시판은 못 봄.
create function public.post_readers(p_post uuid)
returns table (user_id uuid, nickname text, dept text, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from posts p where p.id = p_post and p.board <> 'anon' and (p.author_id = auth.uid() or is_admin())) then
    raise exception '글쓴이와 어드민만 볼 수 있습니다.';
  end if;
  return query
    select r.user_id, pr.nickname, pr.dept, r.read_at from post_reads r join profiles pr on pr.id = r.user_id where r.post_id = p_post order by r.read_at;
end $$;
grant execute on function public.post_readers(uuid) to authenticated;

-- 새 함수는 로그인한 사람만 (init 의 전역 revoke 이후에 만든 것이라 다시 막음)
revoke execute on function public.create_post(public.board_kind, text, text, text, boolean, jsonb, uuid, date) from public, anon;
revoke execute on function public.mark_post_read(uuid) from public, anon;
revoke execute on function public.post_readers(uuid) from public, anon;
