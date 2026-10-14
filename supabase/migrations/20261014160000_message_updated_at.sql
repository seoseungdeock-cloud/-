-- 바뀐 것만 받기: 메시지가 새로 오거나 바뀐(회수 등) 시각. 앱은 마지막으로 받은 시각 뒤의 것만 받습니다.
alter table public.messages add column updated_at timestamptz not null default now();
update public.messages set updated_at = created_at;
create index messages_updated on public.messages (updated_at, id);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger messages_touch before update on public.messages for each row execute function public.touch_updated_at();
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
