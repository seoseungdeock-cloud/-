-- 'Automatically expose new tables'를 켠 프로젝트 흉내: public의 새 표·함수 권한을 anon·authenticated에도 기본으로 줍니다.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
