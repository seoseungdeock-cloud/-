-- PC·웹 브라우저 알림 (웹 푸시). 폰 푸시와 같은 보낼 목록(push_outbox)을 push-send가 브라우저로도 보냅니다.
-- 브라우저마다 받는 주소(endpoint)와 암호 키가 있고, 같은 브라우저에서 다른 계정으로 로그인하면 새 계정으로 옮겨 갑니다.

create table public.web_push_subs (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);
create index web_push_subs_user on public.web_push_subs (user_id);
alter table public.web_push_subs enable row level security;
revoke all on public.web_push_subs from anon, authenticated;
grant all on public.web_push_subs to service_role;

create function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '다시 로그인해 주세요.'; end if;
  if p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception '알림 주소가 올바르지 않습니다.'; end if;
  insert into web_push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
end $$;

create function public.unregister_web_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from web_push_subs where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- 보낼 묶음에 브라우저 주소도 함께 담습니다
drop function public.claim_push_batch(int);
create function public.claim_push_batch(p_limit int default 500)
returns table (id bigint, user_id uuid, title text, body text, data jsonb, tokens text[], web jsonb)
language plpgsql security definer set search_path = public as $$
begin
  delete from push_outbox o where o.created_at < now() - interval '30 days';
  return query
  with picked as (
    select o.id from push_outbox o
    where o.sent_at is null and o.tries < 3 and (o.claimed_at is null or o.claimed_at < now() - interval '2 minutes')
    order by o.id limit p_limit for update skip locked
  ), upd as (
    update push_outbox o set claimed_at = now(), tries = o.tries + 1 from picked where o.id = picked.id
    returning o.id, o.user_id, o.title, o.body, o.data
  )
  select u.id, u.user_id, u.title, u.body, u.data,
    coalesce((select array_agg(t.token) from push_tokens t where t.user_id = u.user_id), '{}'),
    coalesce((select jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'keys', jsonb_build_object('p256dh', w.p256dh, 'auth', w.auth)))
              from web_push_subs w where w.user_id = u.user_id), '[]')
  from upd u order by u.id;
end $$;

revoke execute on function public.register_web_push(text, text, text), public.unregister_web_push(text), public.claim_push_batch(int) from public, anon, authenticated;
grant execute on function public.register_web_push(text, text, text), public.unregister_web_push(text) to authenticated, service_role;
grant execute on function public.claim_push_batch(int) to service_role;
