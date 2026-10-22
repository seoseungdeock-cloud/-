-- 의뢰인 전화번호 넣기 (승덕 2026-10-22): 어드민이 '이름 번호' 목록을 붙여 넣으면 같은 이름의 의뢰인 계정 휴대전화 칸을 채웁니다.
-- 같은 이름이 둘 이상이거나 없으면 바꾸지 않고 알려 줍니다. 번호는 같은 사건방 사람에게만 보입니다(기존 프로필 공개 규칙).
create or replace function public.set_client_phones(p_items jsonb) returns table (name text, result text) language plpgsql security definer set search_path = public as $$
declare it jsonb; n int; v_name text; v_phone text;
begin
  if not is_admin() then raise exception '어드민만 넣을 수 있습니다.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception '목록 형식이 아닙니다.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_name := trim(it ->> 'name'); v_phone := trim(it ->> 'phone');
    if v_phone !~ '^01[0-9]-[0-9]{3,4}-[0-9]{4}$' then name := v_name; result := 'bad'; return next; continue; end if;
    select count(*) into n from profiles where role = 'client' and active and nickname = v_name;
    if n = 1 then
      update profiles set phone = v_phone where role = 'client' and active and nickname = v_name;
      result := 'ok';
    elsif n = 0 then result := 'none';
    else result := 'many';
    end if;
    name := v_name; return next;
  end loop;
end $$;

revoke execute on function public.set_client_phones(jsonb) from public, anon;
grant execute on function public.set_client_phones(jsonb) to authenticated;
