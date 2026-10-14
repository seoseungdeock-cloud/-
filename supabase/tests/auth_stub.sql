-- Supabase가 미리 만들어 두는 것(역할, auth 스키마, 기본 권한)을 로컬 시험용으로 흉내 냅니다.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on all functions in schema auth, extensions to anon, authenticated, service_role;
-- Supabase는 public에 새로 만드는 표·함수 권한을 기본으로 anon·authenticated에도 줍니다.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
