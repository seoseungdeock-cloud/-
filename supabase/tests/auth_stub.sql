-- Supabase가 미리 만들어 두는 것(역할, auth 스키마, 기본 권한)을 로컬 시험용으로 흉내 냅니다.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
-- Supabase와 같은 정의: 예전 방식(claim.sub)과 PostgREST의 claims(JSON) 둘 다 읽습니다.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on all functions in schema auth, extensions to anon, authenticated, service_role;
