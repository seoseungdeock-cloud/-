-- 조직도 보강 (2026-11-25) — 네이버웍스 Directory(조직·직급·직책) 대응.
--
-- 대륜탑 명단에는 직급(admin_user.position), 직책·직군(admin_position), 부서·직급의 표시 순서(common_code.sort_num)가 따로 있습니다.
-- 지금까지는 직급만 title 로 받아 왔는데, 조직도를 지점 > 부서 > 사람(직급 순)으로 그리려면 아래 네 열이 더 필요합니다.
--   title      : 직급 (그대로 — 예: 수석변호사·시니어·매니저)
--   duty       : 직책 (예: 소장·책임사무원). 여러 개면 ', ' 로 이어 붙임
--   job        : 직군 (예: 변호사·법률사무원·직원·상담실장)
--   rank_order : 직급 표시 순서 (작을수록 위). 대륜탑 common_code.sort_num
--   dept_order : 부서 표시 순서
alter table public.profiles add column if not exists duty text check (char_length(duty) <= 80);
alter table public.profiles add column if not exists job text check (char_length(job) <= 40);
alter table public.profiles add column if not exists rank_order integer;
alter table public.profiles add column if not exists dept_order integer;
comment on column public.profiles.duty is '직책 (대륜탑 admin_position parent 75)';
comment on column public.profiles.job is '직군 (대륜탑 admin_position parent 73)';
comment on column public.profiles.rank_order is '직급 표시 순서 — 조직도에서 사람 정렬';
comment on column public.profiles.dept_order is '부서 표시 순서 — 조직도에서 부서 정렬';
