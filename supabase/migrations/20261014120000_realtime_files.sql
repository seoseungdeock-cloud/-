-- 3단계: 실시간 메신저와 방 사진·파일.
-- 실시간: 아래 표가 바뀌면 Supabase Realtime이 앱에 바로 알려 줍니다 (행 보안 그대로: 내가 볼 수 있는 것만).
-- 파일: 비공개 저장소 'room-files'에 '방 id/메시지 id/첨부 id.확장자' 경로로 올리고, 그 방 참여자만 받을 수 있습니다.

alter table public.messages add column attachments jsonb not null default '[]';

-- 첨부 목록 확인: 10개까지, 이 방 경로의 사진·파일만
create function public.room_attachments_ok(p_room uuid, p_atts jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p_atts) = 'array' and jsonb_array_length(p_atts) <= 10 and not exists (
    select 1 from jsonb_array_elements(p_atts) a
    where not (
      a ->> 'kind' in ('image', 'file')
      and coalesce(a ->> 'name', '') <> ''
      and coalesce(a ->> 'path', '') like p_room::text || '/%'
      and position('..' in a ->> 'path') = 0
    )
  )
$$;

drop function public.post_message(uuid, uuid, public.message_kind, text, uuid, jsonb, jsonb, text[], uuid);
create function public.post_message(
  p_id uuid, p_room uuid, p_kind public.message_kind, p_text text,
  p_reply_to uuid default null, p_forward_of jsonb default null, p_bundle jsonb default null,
  p_mentions text[] default '{}', p_contact uuid default null, p_attachments jsonb default '[]'
) returns void language plpgsql security definer set search_path = public as $$
declare m public.room_mode; atts jsonb := coalesce(p_attachments, '[]');
begin
  if me_role() is null or not is_member(p_room) then raise exception '참여 중인 방이 아닙니다.'; end if;
  select mode into m from rooms where id = p_room;
  if p_kind = 'ai' and m <> 'ai' then raise exception '사건수행방에는 AI가 참여하지 않습니다.'; end if;
  if p_kind = 'contact' and (p_contact is null or not can_see_profile(p_contact)) then raise exception '연락처를 찾을 수 없습니다.'; end if;
  if p_reply_to is not null and not exists (select 1 from messages where id = p_reply_to and room_id = p_room) then raise exception '답장할 메시지를 찾을 수 없습니다.'; end if;
  if jsonb_array_length(atts) > 0 and (p_kind <> 'text' or not room_attachments_ok(p_room, atts)) then raise exception '첨부를 올릴 수 없습니다. (10개까지)'; end if;
  if p_kind in ('text', 'contact') and coalesce(trim(p_text), '') = '' and jsonb_array_length(atts) = 0 then raise exception '메시지를 입력해 주세요.'; end if;
  insert into messages (id, room_id, sender_id, sender_kind, kind, text, reply_to, forward_of, bundle, mentions, contact_id, origin_id, attachments)
  values (
    p_id, p_room,
    case when p_kind in ('text', 'contact') then auth.uid() end,
    case p_kind when 'ai' then 'ai' when 'bot' then 'bot' when 'system' then 'system' else 'user' end::public.sender_kind,
    p_kind, coalesce(p_text, ''), p_reply_to, p_forward_of, p_bundle, coalesce(p_mentions, '{}'),
    case when p_kind = 'contact' then p_contact end,
    case when p_kind not in ('text', 'contact') then auth.uid() end,
    atts
  );
end $$;

-- 회수하면 첨부도 함께 내립니다
create or replace function public.recall_message(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update messages set recalled = true, text = '', attachments = '[]' where id = p_id and sender_id = auth.uid();
  if not found then raise exception '회수할 수 없는 메시지입니다.'; end if;
end $$;

-- 저장소 경로의 첫 칸(방 id)으로 참여 여부 확인
create function public.room_file_member(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then is_member(split_part(p_name, '/', 1)::uuid) else false end
$$;

revoke execute on function public.room_attachments_ok(uuid, jsonb), public.room_file_member(text) from public, anon;
revoke execute on function public.post_message(uuid, uuid, public.message_kind, text, uuid, jsonb, jsonb, text[], uuid, jsonb) from public, anon;
grant execute on function public.room_attachments_ok(uuid, jsonb), public.room_file_member(text),
  public.post_message(uuid, uuid, public.message_kind, text, uuid, jsonb, jsonb, text[], uuid, jsonb) to authenticated, service_role;

-- Supabase에서만: 저장소 버킷·규칙, 실시간 알림
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('room-files', 'room-files', false, 50 * 1024 * 1024)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
    execute $p$create policy room_files_read on storage.objects for select to authenticated
      using (bucket_id = 'room-files' and public.room_file_member(name))$p$;
    execute $p$create policy room_files_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'room-files' and public.room_file_member(name))$p$;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.message_reactions, public.message_hides, public.room_members, public.room_notices, public.rooms,
      public.cases, public.hearings, public.case_progress, public.hearing_alerts, public.hearing_alert_recipients;
  end if;
end $$;
