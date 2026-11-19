-- 봇 (2026-11-22) — 바깥 시스템(대륜탑·SKYZAI·사내 스크립트)이 대화방에 메시지를 보내는 공식 통로. 네이버웍스 Bot API 대응.
--
-- bots      : 봇 이름·설명·토큰 해시. 어드민이 백오피스에서 만들고, 토큰은 만들 때 한 번만 보여 준다.
-- bot_rooms : 봇이 글을 쓸 수 있는 방. 어드민이 넣고 뺀다.
-- 메시지는 서버 함수 bot-send 가 service 키로 넣는다 (sender_kind='bot', bot_name 에 봇 이름).

alter table public.messages add column if not exists bot_name text check (char_length(bot_name) <= 40);

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  description text check (char_length(description) <= 200),
  token_hash text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create table public.bot_rooms (
  bot_id uuid not null references public.bots (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (bot_id, room_id)
);

alter table public.bots enable row level security;
alter table public.bot_rooms enable row level security;
-- 토큰 해시는 어드민에게도 안 보이도록 열 권한으로 가립니다
revoke all on public.bots from authenticated;
grant select (id, name, description, active, created_by, created_at, last_used_at) on public.bots to authenticated;
grant update (name, description, active) on public.bots to authenticated;
grant delete on public.bots to authenticated;
create policy bots_admin_read on public.bots for select to authenticated using (is_admin());
create policy bots_admin_update on public.bots for update to authenticated using (is_admin()) with check (is_admin());
create policy bots_admin_delete on public.bots for delete to authenticated using (is_admin());
create policy bot_rooms_admin on public.bot_rooms for all to authenticated using (is_admin()) with check (is_admin());

-- 봇 만들기: 토큰은 서버에서 만들어 해시만 저장하고, 원문은 이 호출의 응답으로 한 번만 돌려줍니다.
create function public.create_bot(p_name text, p_description text default null)
returns table (id uuid, token text) language plpgsql security definer set search_path = public, extensions as $$
declare t text; bid uuid;
begin
  if not is_admin() then raise exception '어드민만 봇을 만들 수 있습니다.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '봇 이름을 적어 주세요.'; end if;
  t := 'skb_' || encode(gen_random_bytes(24), 'hex');
  insert into bots (name, description, token_hash, created_by) values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), encode(digest(t, 'sha256'), 'hex'), auth.uid()) returning bots.id into bid;
  return query select bid, t;
end $$;
grant execute on function public.create_bot(text, text) to authenticated;
revoke execute on function public.create_bot(text, text) from public, anon;

-- 토큰 다시 만들기 (유출 시)
create function public.rotate_bot_token(p_bot uuid) returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if not is_admin() then raise exception '어드민만 할 수 있습니다.'; end if;
  t := 'skb_' || encode(gen_random_bytes(24), 'hex');
  update bots set token_hash = encode(digest(t, 'sha256'), 'hex') where id = p_bot;
  if not found then raise exception '봇을 찾을 수 없습니다.'; end if;
  return t;
end $$;
grant execute on function public.rotate_bot_token(uuid) to authenticated;
revoke execute on function public.rotate_bot_token(uuid) from public, anon;

-- 서버 함수(service_role)가 쓰는 조회: 토큰으로 봇 찾기
create function public.bot_by_token(p_token text)
returns table (id uuid, name text, active boolean) language sql stable security definer set search_path = public, extensions as $$
  select b.id, b.name, b.active from bots b where b.token_hash = encode(digest(p_token, 'sha256'), 'hex')
$$;
revoke all on function public.bot_by_token(text) from public, anon, authenticated;
grant execute on function public.bot_by_token(text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bots, public.bot_rooms;
  end if;
end $$;
