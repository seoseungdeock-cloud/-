-- 4단계: 게시판 사진·파일.
-- 비공개 저장소 'board-files'에 '글 id/첨부 id.확장자' 경로로 둡니다. 그 게시판을 볼 수 있는 사람만 받을 수 있습니다.
-- 익명 게시판이 있으므로 올리기는 앱이 직접 하지 않고, 서버 함수 board-upload가 내준 1회용 주소로 합니다
-- (저장소에 올린 사람 기록이 남지 않게 해서, 파일로 글쓴이를 알아낼 수 없게 함).

-- 첨부 확인: 5개까지, 이 글 경로의 사진·파일만
create function public.post_attachments_ok(p_post uuid, p_atts jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p_atts) = 'array' and jsonb_array_length(p_atts) <= 5 and not exists (
    select 1 from jsonb_array_elements(p_atts) a
    where not (
      a ->> 'kind' in ('image', 'file')
      and coalesce(a ->> 'name', '') <> ''
      and coalesce(a ->> 'path', '') like p_post::text || '/%'
      and position('..' in a ->> 'path') = 0
      and position('/' in substr(a ->> 'path', 38)) = 0
    )
  )
$$;

create or replace function public.create_post(p_board public.board_kind, p_title text, p_body text, p_field text default '', p_notice boolean default false, p_attachments jsonb default '[]', p_id uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid; r public.role := me_role(); atts jsonb := coalesce(p_attachments, '[]');
begin
  perform board_guard(p_board);
  if p_board = 'lawnews' then raise exception '자동 글만 올라오는 게시판입니다.'; end if;
  if (p_board = 'notice' or (p_board = 'skyzai' and p_notice)) and r <> 'admin' then raise exception '공지는 어드민만 올릴 수 있습니다.'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then raise exception '제목과 내용을 입력해 주세요.'; end if;
  if p_board in ('anon', 'lawyer', 'advice', 'praise') and coalesce(p_field, '') = '' then raise exception '분야를 골라 주세요.'; end if;
  if jsonb_array_length(atts) > 5 then raise exception '첨부는 5개까지 올릴 수 있습니다.'; end if;
  if not post_attachments_ok(p_id, atts) then raise exception '첨부를 올릴 수 없습니다.'; end if;
  insert into posts (id, board, author_id, field, title, body, notice, attachments)
  values (p_id, p_board, auth.uid(), coalesce(p_field, ''), trim(p_title), trim(p_body), p_board = 'skyzai' and p_notice, atts)
  returning posts.id into id;
  perform alias_for(id, auth.uid());
  return id;
end $$;

-- 올리기 전 확인 (board-upload 함수가 글쓴이 계정으로 부름): 이 게시판에 글을 쓸 수 있는지
create function public.board_upload_check(p_board public.board_kind) returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform board_guard(p_board);
  if p_board = 'lawnews' then raise exception '자동 글만 올라오는 게시판입니다.'; end if;
end $$;

-- 저장소 경로의 첫 칸(글 id)으로 볼 수 있는 글인지 확인
create function public.board_file_visible(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists (select 1 from posts p where p.id = split_part(p_name, '/', 1)::uuid and can_see_board(p.board)) else false end
$$;

revoke execute on function public.post_attachments_ok(uuid, jsonb), public.board_upload_check(public.board_kind), public.board_file_visible(text) from public, anon;
grant execute on function public.post_attachments_ok(uuid, jsonb), public.board_upload_check(public.board_kind), public.board_file_visible(text) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('board-files', 'board-files', false, 50 * 1024 * 1024)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
    -- 받기만 앱에서. 올리기 규칙은 두지 않음 (board-upload의 1회용 주소로만)
    execute $p$create policy board_files_read on storage.objects for select to authenticated
      using (bucket_id = 'board-files' and public.board_file_visible(name))$p$;
  end if;
end $$;
