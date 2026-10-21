-- 로컬 Postgres에서 보안 규칙(RLS)을 확인하는 시험. supabase/tests/run.sh 로 실행합니다.
-- 모든 계정·데이터는 가짜입니다.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema tst;
grant usage on schema tst to authenticated, anon, service_role;
create table tst.results (name text, ok boolean, detail text);
grant insert on tst.results to authenticated, anon, service_role;

create function tst.check(name text, ok boolean, detail text default '') returns void language sql as $$
  insert into tst.results values (name, coalesce(ok, false), detail)
$$;
-- sql이 msg를 담은 오류로 끝나야 통과
create function tst.throws(name text, sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  perform tst.check(name, false, '오류 없이 통과됨');
exception when others then
  perform tst.check(name, sqlerrm like '%' || msg || '%', sqlerrm);
end $$;
grant execute on all functions in schema tst to authenticated, anon, service_role;

-- 가짜 계정
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@rightnow.local'),
  ('00000000-0000-0000-0000-00000000000b', 'subadmin@rightnow.local'),
  ('00000000-0000-0000-0000-00000000000c', 'lawyer@rightnow.local'),
  ('00000000-0000-0000-0000-00000000000d', 'staff@rightnow.local'),
  ('00000000-0000-0000-0000-00000000000e', 'client@rightnow.local'),
  ('00000000-0000-0000-0000-00000000000f', 'client2@rightnow.local');
insert into public.profiles (id, login_id, nickname, role, firm, super_admin) values
  ('00000000-0000-0000-0000-00000000000a', 'admin', '관리자', 'admin', '테스트법인', true),
  ('00000000-0000-0000-0000-00000000000b', 'subadmin', '부관리자', 'admin', '테스트법인', false),
  ('00000000-0000-0000-0000-00000000000c', 'lawyer', '김변호', 'lawyer', '테스트법인', false),
  ('00000000-0000-0000-0000-00000000000d', 'staff', '이직원', 'staff', '테스트법인', false),
  ('00000000-0000-0000-0000-00000000000e', 'client', '박의뢰', 'client', null, false),
  ('00000000-0000-0000-0000-00000000000f', 'client2', '최의뢰', 'client', null, false);

-- 사건방 하나 (의뢰인 client + 변호사)
insert into public.rooms (id, kind, mode, title) values ('10000000-0000-0000-0000-000000000001', 'case', 'private', '테스트 사건');
insert into public.room_members (room_id, user_id, is_master) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', false);
insert into public.cases (room_id, title, field) values ('10000000-0000-0000-0000-000000000001', '테스트 사건', '민사');

create function tst.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;

-- ── 의뢰인 ──
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.check('의뢰인: 자기 사건방이 보임', (select count(*) = 1 from rooms));
select tst.check('의뢰인: 같은 방 변호사 프로필만 보임 (직원·다른 의뢰인 안 보임)', (select array_agg(login_id order by login_id) = '{client,lawyer}' from profiles));
select tst.throws('의뢰인: 변호사 게시판 글쓰기 막힘', $$select create_post('lawyer', '제목', '내용', '형사')$$, '글을 찾을 수 없습니다');
select tst.throws('의뢰인: 공지 쓰기 막힘', $$select create_post('notice', '제목', '내용')$$, '글을 찾을 수 없습니다');
select tst.check('의뢰인: 익명 글쓰기', create_post('anon', '전세 보증금', '돌려받는 방법이 궁금합니다', '민사') is not null);
select tst.throws('의뢰인: 글쓴이 id 직접 조회 막힘', $$select author_id from posts$$, 'permission denied');
select tst.check('의뢰인: 보기에서 작성자 id 숨김', (select bool_and(author_id is null) and bool_and(mine) from post_feed));
select tst.throws('의뢰인: 오픈대화방 못 봄 (표)', $$select 1/count(*) from open_rooms$$, 'division by zero');
select tst.throws('의뢰인: 역할 바꾸기 막힘', $$update profiles set role = 'admin' where id = auth.uid()$$, 'permission denied');
update profiles set status = '외근 중' where id = auth.uid();
select tst.check('의뢰인: 내 상태 메시지는 바꿈', (select status = '외근 중' from profiles where id = auth.uid()));
select tst.throws('의뢰인: 업무 명령 못 씀', $$select 1/(can_use_agents())::int$$, 'division by zero');
select tst.throws('의뢰인: 남인 척 메시지 막힘', $$insert into messages (room_id, sender_id, sender_kind, kind, text) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'user', 'text', '가짜')$$, 'row-level security');
select tst.throws('의뢰인: 봇 메시지 위조 막힘', $$insert into messages (room_id, sender_id, sender_kind, kind, text) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'bot', 'bot', '기일 변경')$$, 'row-level security');
insert into messages (room_id, sender_id, sender_kind, kind, text) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'user', 'text', '안녕하세요');
select tst.check('의뢰인: 자기 방에 메시지 보냄', (select count(*) = 1 from messages where text = '안녕하세요'));

-- ── 다른 의뢰인 ──
select tst.as_user('00000000-0000-0000-0000-00000000000f');
select tst.check('다른 의뢰인: 남의 사건방·메시지 안 보임', (select count(*) = 0 from rooms) and (select count(*) = 0 from messages));
select tst.throws('다른 의뢰인: 남의 방에 메시지 막힘', $$insert into messages (room_id, sender_id, sender_kind, kind, text) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'user', 'text', '끼어들기')$$, 'row-level security');
select tst.check('다른 의뢰인: 익명 글에 댓글', comment_post((select id from post_feed limit 1), '저도 궁금해요') is not null);
select tst.check('다른 의뢰인: 쪽지 열기 (상대는 익명 번호)', open_note((select id from post_feed limit 1)) is not null);
select tst.check('다른 의뢰인: 쪽지 상대 id 숨김, 익명 1', (select other_id is null and other_alias_no = 1 from note_feed));
select tst.throws('다른 의뢰인: 쪽지 표 상대 id 조회 막힘', $$select a_id from note_threads$$, 'permission denied');
select tst.throws('다른 의뢰인: 익명 번호 함수 직접 호출 막힘', $$select alias_for((select id from post_feed limit 1), auth.uid())$$, 'permission denied');

-- ── 변호사 ──
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.check('변호사: 같은 법인 사람 보임', (select count(*) >= 4 from profiles where firm = '테스트법인'));
select tst.check('변호사: 사건자문 실명 글', create_post('advice', '사건 자문', '의견 부탁드립니다', '형사') is not null);
select tst.check('변호사: 실명 게시판은 작성자 보임', (select author_id is not null from post_feed where board = 'advice'));
select tst.check('변호사: 익명 글 작성자 숨김', (select bool_and(author_id is null) from post_feed where board = 'anon'));
select tst.throws('변호사: 공지 쓰기 막힘', $$select create_post('notice', '공지', '내용')$$, '어드민만');
select tst.throws('변호사: 법령 게시판 직접 쓰기 막힘', $$select create_post('lawnews', '법령', '내용')$$, '자동 글만');
select tst.check('변호사: 오픈대화방 만들기 (비밀번호)', create_open_room('형사 실무', '', '{}', 30, '익명변호사', 'pass1234') is not null);
select tst.throws('변호사: 오픈방 비밀번호 해시 조회 막힘', $$select password_hash from open_rooms$$, 'permission denied');
select tst.throws('변호사: 오픈방 실제 이용자 조회 막힘', $$select user_id from open_members$$, 'permission denied');
select tst.throws('변호사: 실제 이용자 함수 막힘', $$select * from open_room_identities((select id from open_room_feed limit 1))$$, '관리자어드민만');
select tst.check('변호사: 잠긴 방 표시', (select locked from open_room_feed limit 1));

-- ── 직원 ──
select tst.as_user('00000000-0000-0000-0000-00000000000d');
select tst.throws('직원: 비밀번호 틀리면 못 들어감', $$select join_open_room((select id from open_room_feed limit 1), '직원A', 'wrong')$$, '비밀번호가 맞지 않습니다');
select join_open_room((select id from open_room_feed limit 1), '직원A', 'pass1234');
select tst.check('직원: 맞는 비밀번호로 들어감', (select joined from open_room_feed limit 1));
select tst.check('직원: 오픈방 메시지는 닉네임으로', (select count(*) >= 2 from open_message_feed));
select tst.throws('직원: 변호사 게시판 못 봄', $$select 1/count(*) from post_feed where board = 'lawyer' or board = 'advice'$$, 'division by zero');

-- ── 부관리자 (일반 어드민) ──
select tst.as_user('00000000-0000-0000-0000-00000000000b');
select tst.check('어드민: 익명 글 실제 작성자 보임', (select bool_and(author_id is not null) from post_feed where board = 'anon'));
select tst.throws('어드민: 관리자어드민 계정 중지 막힘', $$select admin_set_active('00000000-0000-0000-0000-00000000000a', false)$$, '관리자어드민만');
select tst.throws('어드민: 관리자어드민 지정 막힘', $$select admin_set_super_admin(auth.uid(), true)$$, '관리자어드민만');
select tst.throws('어드민: 건의사항 답변 막힘', $$select answer_suggestion(gen_random_uuid(), 'done', 'x')$$, '관리자어드민만');
select tst.throws('어드민: 오픈방 실제 이용자 막힘', $$select * from open_room_identities((select id from open_room_feed limit 1))$$, '관리자어드민만');
select admin_restrict((select id from post_feed where board = 'anon' limit 1), null, 24);

-- ── 제한된 의뢰인 ──
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.throws('제한된 사용자: 글쓰기 막힘', $$select create_post('anon', '제목', '내용', '민사')$$, '이용이 제한');
select tst.throws('제한된 사용자: 투표 막힘', $$select vote_post((select id from post_feed limit 1), 1::smallint)$$, '이용이 제한');

-- ── 관리자어드민 ──
select tst.as_user('00000000-0000-0000-0000-00000000000a');
select tst.check('관리자어드민: 오픈방 실제 이용자 보임', (select count(*) = 2 from open_room_identities((select id from open_room_feed limit 1))));
select tst.check('관리자어드민: 오픈방 메시지 참여 없이 봄', (select count(*) >= 2 from open_message_feed));
select tst.throws('관리자어드민: 마지막 관리자어드민 해제 막힘', $$select admin_set_super_admin(auth.uid(), false)$$, '한 명 이상');

-- ── 기일 알람 ──
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.check('변호사: 기일 알림 올림', sync_hearing('10000000-0000-0000-0000-000000000001', 'new', '변론기일', '2026-11-19', '10:00', '서울중앙지법 제301호') is not null);
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.check('의뢰인: 기일 알림 받음 (확인 전)', (select count(*) = 1 from hearing_alert_recipients r where r.user_id = auth.uid() and r.acked_at is null));
select ack_hearing((select id from hearing_alerts limit 1));
select tst.check('의뢰인: 확인 기록 남음', (select acked_at is not null from hearing_alert_recipients where user_id = auth.uid()));
select tst.throws('의뢰인: 기일 직접 올리기 막힘', $$select sync_hearing('10000000-0000-0000-0000-000000000001', 'new', '선고기일', '2026-12-01')$$, '담당 변호사');
reset role;
select id as alert from hearing_alerts limit 1 \gset
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000f');
select tst.throws('다른 의뢰인: 남의 기일 확인 막힘', format('select ack_hearing(%L)', :'alert'), '확인할 기일 알람이 없습니다');

-- ── 서버(대륜탑 연동) ──
reset role;
set role service_role;
select tst.as_user('');
select tst.check('서버: 대륜탑 기일 알림 올림', sync_hearing('10000000-0000-0000-0000-000000000001', 'new', '선고기일', '2026-12-10', '14:00', null, null, 'daeryuntop') is not null);
reset role;
select tst.check('서버: 대륜탑 알림은 모두 확인 전', (select count(*) = 2 from hearing_alert_recipients r join hearing_alerts a on a.id = r.alert_id where a.source = 'daeryuntop' and r.acked_at is null));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.throws('변호사: 대륜탑 출처로 위장 막힘', $$select sync_hearing('10000000-0000-0000-0000-000000000001', 'new', '선고기일', '2026-12-10', null, null, null, 'daeryuntop')$$, '서버에서만');


-- ── 메신저 함수 ──
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select post_message('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'bot', '형사 절차 안내');
select tst.check('의뢰인: 안내 봇 메시지는 올린 사람 기록', (select sender_kind = 'bot' and sender_id is null and origin_id = auth.uid() from messages where id = '20000000-0000-0000-0000-000000000001'));
select tst.throws('의뢰인: 사건수행방에 AI 메시지 막힘', $$select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'ai', '가짜 AI')$$, 'AI가 참여하지 않습니다');
select tst.throws('의뢰인: 모르는 직원과 방 만들기 막힘', $$select create_room(gen_random_uuid(), 'direct', 'private', '', '{00000000-0000-0000-0000-00000000000d}')$$, '초대할 수 없는 사람');
select tst.throws('의뢰인: 업무방 만들기 막힘', $$select create_room(gen_random_uuid(), 'office', 'private', '사무소', '{}')$$, '로펌 구성원만');
select tst.check('의뢰인: 같은 방 변호사와 1:1', create_room('10000000-0000-0000-0000-000000000002', 'direct', 'private', '', '{00000000-0000-0000-0000-00000000000c}') is not null);
select tst.throws('의뢰인: 사건방 나가기 막힘', $$select leave_room('10000000-0000-0000-0000-000000000001')$$, '나갈 수 없습니다');
select tst.check('의뢰인: 상담 신청 방', open_lawyer_room('10000000-0000-0000-0000-000000000003', 'consult', '김변호 상담', 'of_1', 'lw_1') is not null);
select open_lawyer_room('10000000-0000-0000-0000-000000000004', 'case', '민사 · 김변호', 'of_1', 'lw_1', '민사');
select tst.check('의뢰인: 수임 요청 사건방', (select stage = '수임' from cases where room_id = '10000000-0000-0000-0000-000000000004'));
select tst.throws('의뢰인: 사건 단계 바꾸기 막힘', $$select set_case_stage('10000000-0000-0000-0000-000000000001', '종결')$$, '담당 변호사');
select set_notice(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '형사 절차 안내');
select tst.check('의뢰인: 공지 올림', (select count(*) = 1 from room_notices where by_id = auth.uid()));

select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.check('변호사: 그룹방 만들기 (같은 법인)', create_room('10000000-0000-0000-0000-000000000005', 'group', 'private', '팀방', '{00000000-0000-0000-0000-00000000000d,00000000-0000-0000-0000-00000000000b}') is not null);
select tst.check('변호사: 만든 사람이 마스터', (select is_master from room_members where room_id = '10000000-0000-0000-0000-000000000005' and user_id = auth.uid()));
select tst.throws('변호사: 남의 사건방 기록 막힘', $$select add_case_entry(gen_random_uuid(), '10000000-0000-0000-0000-000000000004', 'cost', '인지대', 1000)$$, '담당 변호사');
select add_case_entry(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'cost', '인지대', 50000);
select set_case_stage('10000000-0000-0000-0000-000000000001', '진행');
select tst.check('변호사: 사건 기록·단계', (select count(*) = 1 from case_costs) and (select stage = '진행' from cases where room_id = '10000000-0000-0000-0000-000000000001'));
select kick_member('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b');
select tst.check('변호사: 마스터가 내보내기', (select count(*) = 2 from room_members where room_id = '10000000-0000-0000-0000-000000000005'));
select leave_room('10000000-0000-0000-0000-000000000005');
select tst.as_user('00000000-0000-0000-0000-00000000000d');
select tst.check('직원: 마스터가 나가면 남은 사람이 마스터', (select is_master from room_members where room_id = '10000000-0000-0000-0000-000000000005' and user_id = auth.uid()));
select tst.throws('직원: 마지막 마스터 해제 막힘', $$select set_master('10000000-0000-0000-0000-000000000005', auth.uid(), false)$$, '한 명 이상');
select tst.throws('직원: 남의 방 초대 막힘', $$select add_members('10000000-0000-0000-0000-000000000001', '{00000000-0000-0000-0000-00000000000d}')$$, '참여 중인 방이 아닙니다');

-- ── 오픈대화방 나가기·내보내기 ──
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.check('변호사: 내 참여자 번호 보임', (select count(*) = 1 from my_open_members()));
reset role;
select id as om from open_members where alias = '직원A' \gset
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select kick_open((select id from open_room_feed limit 1), :'om');
select tst.as_user('00000000-0000-0000-0000-00000000000d');
select tst.check('직원: 내보내진 방은 다시 못 들어감', (select banned and not joined from open_room_feed limit 1));
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select leave_open_room((select id from open_room_feed limit 1));
select tst.check('변호사: 마지막 사람이 나가면 방 없어짐', (select count(*) = 0 from open_room_feed));

-- ── 쪽지 읽음·제한 해제 ──
select tst.as_user('00000000-0000-0000-0000-00000000000f');
select send_note((select id from note_feed limit 1), '안녕하세요');
select tst.check('다른 의뢰인: 보낸 쪽지는 읽음', (select my_read_at is not null from note_feed limit 1));
select tst.as_user('00000000-0000-0000-0000-00000000000b');
select admin_lift_restriction('00000000-0000-0000-0000-00000000000e');
select tst.check('어드민: 이용 제한 해제', (select count(*) = 0 from board_bans));
select tst.check('로그인 기록', touch_login());

-- ── 폰 푸시 (2단계) ──
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select register_push_token('ExponentPushToken[client-phone]', 'ios');
select tst.throws('의뢰인: 이상한 푸시 주소 막힘', $$select register_push_token('hello', 'ios')$$, '올바르지 않습니다');
select tst.throws('의뢰인: 푸시 주소 표 직접 못 봄', $$select 1 from push_tokens$$, 'permission denied');
select tst.throws('의뢰인: 보낼 푸시 표 못 봄', $$select 1 from push_outbox$$, 'permission denied');
select tst.throws('의뢰인: 미리 알림 직접 못 부름', $$select enqueue_hearing_reminders()$$, 'permission denied');
select tst.throws('의뢰인: 다시 알리기 막힘', $$select remind_hearing((select id from hearing_alerts where source = 'daeryuntop'))$$, '담당 변호사');
reset role;
select tst.check('푸시: 변호사 입력 기일은 의뢰인에게만 (올린 변호사는 이미 확인)', (select count(*) = 1 from push_outbox o join hearing_alerts a on a.id = (o.data->>'alertId')::uuid where a.source = 'manual' and o.user_id = '00000000-0000-0000-0000-00000000000e'));
select tst.check('푸시: 대륜탑 기일은 둘 다에게', (select count(*) = 2 from push_outbox o join hearing_alerts a on a.id = (o.data->>'alertId')::uuid where a.source = 'daeryuntop'));
select tst.check('푸시: 제목에 사건명, 본문에 날짜와 법원 장소', (select title = '새 기일 · 테스트 사건' and body like E'변론기일 11월 19일(목) 10:00\n서울중앙지법 제301호\n%' from push_outbox where data->>'kind' = 'hearing' order by id limit 1));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.check('변호사: 다시 알리기 (확인 안 한 사람만)', remind_hearing((select id from hearing_alerts where source = 'daeryuntop')) = 2);
select tst.throws('변호사: 10분 안에 또 다시 알리기 막힘', $$select remind_hearing((select id from hearing_alerts where source = 'daeryuntop'))$$, '10분');
reset role;
set role service_role;
select tst.check('미리 알림: 7일 전 오전 9시 전에는 안 보냄', enqueue_hearing_reminders('2026-11-12 08:59+09') = 0);
select tst.check('미리 알림: 7일 전 오전 9시에 방 사람 모두', enqueue_hearing_reminders('2026-11-12 09:00+09') = 2);
select tst.check('미리 알림: 두 번 보내지 않음', enqueue_hearing_reminders('2026-11-12 09:05+09') = 0);
select tst.check('미리 알림: 3시간 지난 것은 건너뜀', enqueue_hearing_reminders('2026-11-18 12:01+09') = 0);
select tst.check('미리 알림: 당일 오전 8시', enqueue_hearing_reminders('2026-11-19 08:00+09') = 2);
select tst.check('보내기: 의뢰인 폰 주소가 함께 옴', (select bool_or(tokens = '{ExponentPushToken[client-phone]}') from claim_push_batch() where user_id = '00000000-0000-0000-0000-00000000000e'));
select tst.check('보내기: 가져간 것은 2분 동안 다시 안 옴', (select count(*) = 0 from claim_push_batch()));
select finish_push((select array_agg(id) from push_outbox));
reset role;
select tst.check('보내기: 보낸 표시', (select bool_and(sent_at is not null) from push_outbox));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000f');
select register_push_token('ExponentPushToken[client-phone]', 'ios');
reset role;
select tst.check('푸시 주소: 같은 폰에서 다른 계정 로그인하면 옮겨감', (select user_id = '00000000-0000-0000-0000-00000000000f' from push_tokens));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select unregister_push_token('ExponentPushToken[client-phone]');
reset role;
select tst.check('푸시 주소: 남의 주소는 못 지움', (select count(*) = 1 from push_tokens));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000f');
select unregister_push_token('ExponentPushToken[client-phone]');
reset role;
select tst.check('푸시 주소: 로그아웃하면 지움', (select count(*) = 0 from push_tokens));

-- ── 방 사진·파일 (3단계) ──
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select post_message('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'text', '',
  p_attachments => '[{"id":"f1","kind":"image","name":"증거.jpg","path":"10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/f1-증거.jpg","size":1000}]');
select tst.check('의뢰인: 내 사건방에 사진 보냄 (글 없이)', (select jsonb_array_length(attachments) = 1 from messages where id = '30000000-0000-0000-0000-000000000001'));
select tst.throws('의뢰인: 다른 방 경로 첨부 막힘', $$select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '', p_attachments => '[{"id":"f2","kind":"file","name":"x","path":"99999999-0000-0000-0000-000000000001/a/x"}]')$$, '첨부를 올릴 수 없습니다');
select tst.throws('의뢰인: 상위 경로 첨부 막힘', $$select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '', p_attachments => '[{"id":"f2","kind":"file","name":"x","path":"10000000-0000-0000-0000-000000000001/../99999999-0000-0000-0000-000000000001/x"}]')$$, '첨부를 올릴 수 없습니다');
select tst.throws('의뢰인: 빈 메시지 막힘', $$select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '')$$, '메시지를 입력');
select tst.check('저장소: 내 방 경로는 받을 수 있음', room_file_member('10000000-0000-0000-0000-000000000001/a/b.jpg'));
select tst.check('저장소: 이상한 경로는 막힘', not room_file_member('../x') and not room_file_member('notauuid/x'));
select recall_message('30000000-0000-0000-0000-000000000001');
select tst.check('회수하면 첨부도 내려감', (select jsonb_array_length(attachments) = 0 and recalled from messages where id = '30000000-0000-0000-0000-000000000001'));
select tst.as_user('00000000-0000-0000-0000-00000000000f');
select tst.check('저장소: 다른 의뢰인은 남의 방 파일 못 받음', not room_file_member('10000000-0000-0000-0000-000000000001/a/b.jpg'));
reset role;

-- ── 게시판 사진·파일 (4단계) ──
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.check('의뢰인: 익명 글에 사진 첨부', create_post('anon', '사진 질문', '이 계약서 봐 주세요', '민사',
  p_attachments => '[{"id":"f1","kind":"image","name":"계약서.jpg","path":"40000000-0000-0000-0000-000000000001/f1-계약서.jpg"}]',
  p_id => '40000000-0000-0000-0000-000000000001') is not null);
select tst.throws('의뢰인: 다른 글 경로 첨부 막힘', $$select create_post('anon', 't', 'b', '민사', p_attachments => '[{"id":"f","kind":"file","name":"x","path":"40000000-0000-0000-0000-000000000009/x"}]', p_id => '40000000-0000-0000-0000-000000000002')$$, '첨부를 올릴 수 없습니다');
select tst.throws('의뢰인: 하위 폴더 경로 막힘', $$select create_post('anon', 't', 'b', '민사', p_attachments => '[{"id":"f","kind":"file","name":"x","path":"40000000-0000-0000-0000-000000000003/a/b"}]', p_id => '40000000-0000-0000-0000-000000000003')$$, '첨부를 올릴 수 없습니다');
select tst.check('저장소: 익명 글 파일은 누구나 받음', board_file_visible('40000000-0000-0000-0000-000000000001/f1-계약서.jpg'));
select tst.throws('의뢰인: 변호사 게시판 올리기 확인 막힘', $$select board_upload_check('lawyer')$$, '글을 찾을 수 없습니다');
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.check('변호사: 변호사 게시판 글에 파일', create_post('lawyer', '판례 공유', '참고하세요', '형사',
  p_attachments => '[{"id":"f2","kind":"file","name":"판결문.pdf","path":"40000000-0000-0000-0000-000000000004/f2-판결문.pdf"}]',
  p_id => '40000000-0000-0000-0000-000000000004') is not null);
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.check('저장소: 의뢰인은 변호사 게시판 파일 못 받음', not board_file_visible('40000000-0000-0000-0000-000000000004/f2-판결문.pdf'));
reset role;

-- ── 새 메시지 푸시 ──
reset role;
delete from push_outbox;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '내일 서류 보내 주세요');
reset role;
select tst.check('메시지 푸시: 보낸 사람 빼고 의뢰인에게', (select count(*) = 1 and bool_and(user_id = '00000000-0000-0000-0000-00000000000e') from push_outbox where data->>'kind' = 'message'));
select tst.check('메시지 푸시: 제목은 방, 본문은 보낸 사람과 내용', (select title = '테스트 사건' and body = '김변호: 내일 서류 보내 주세요' from push_outbox where data->>'kind' = 'message'));
update room_members set notify = 'mention' where user_id = '00000000-0000-0000-0000-00000000000e';
delete from push_outbox;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '참고만 하세요');
select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '@박의뢰 확인 부탁드립니다', p_mentions => '{00000000-0000-0000-0000-00000000000e}');
select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'system', '박의뢰님이 확인했습니다.');
reset role;
select tst.check('메시지 푸시: 멘션만 설정이면 멘션된 것만, 시스템 안내는 안 감', (select count(*) = 1 and bool_and(title like '%(@멘션)') from push_outbox where data->>'kind' = 'message'));
update room_members set notify = 'off' where user_id = '00000000-0000-0000-0000-00000000000e';
delete from push_outbox;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '@박의뢰 끄면 안 감', p_mentions => '{00000000-0000-0000-0000-00000000000e}');
reset role;
select tst.check('메시지 푸시: 알림 끄기면 안 감', (select count(*) = 0 from push_outbox));
update room_members set notify = 'all';

-- ── PC 웹 알림 ──
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select register_web_push('https://fcm.googleapis.com/fcm/send/abc', 'key1', 'auth1');
select tst.throws('웹 알림: 이상한 주소 막힘', $$select register_web_push('http://evil/x', 'k', 'a')$$, '올바르지 않습니다');
select tst.throws('웹 알림: 표 직접 못 봄', $$select 1 from web_push_subs$$, 'permission denied');
reset role;
delete from push_outbox;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select post_message(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'text', '웹 알림 시험');
reset role;
set role service_role;
select tst.check('웹 알림: 보낼 묶음에 브라우저 주소', (select bool_or(web @> '[{"endpoint":"https://fcm.googleapis.com/fcm/send/abc"}]') from claim_push_batch()));
reset role;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select unregister_web_push('https://fcm.googleapis.com/fcm/send/abc');
reset role;
select tst.check('웹 알림: 로그아웃하면 지움', (select count(*) = 0 from web_push_subs));

-- ── 불변기간 알림 ──
reset role;
update profiles set branch = '부산총괄본부' where login_id = 'lawyer';
delete from push_outbox;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select add_deadline('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '항소기간', '2026-11-10');
select add_deadline('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '이의신청기간', '2026-11-10');
select tst.check('불변기간: 변호사는 봄', (select count(*) = 2 from case_deadlines));
select tst.throws('불변기간: 변호사는 대표 지정 못 함', $$select admin_set_executive('00000000-0000-0000-0000-00000000000b', true)$$, '어드민만');
select tst.throws('불변기간: 변호사는 알림 끄기 못 함', $$select admin_set_deadline_alerts('10000000-0000-0000-0000-000000000001', false)$$, '어드민만');
select tst.throws('불변기간: 변호사는 사건 전체 목록 못 봄', $$select admin_deadline_cases()$$, '어드민만');
select tst.throws('불변기간: 게시판에 직접 글쓰기 막힘', $$select create_post('deadline', '제목', '내용')$$, '자동 글만');
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.check('불변기간: 의뢰인에게 안 보임', (select count(*) = 0 from case_deadlines));
select tst.throws('불변기간: 의뢰인은 등록 못 함', $$select add_deadline(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '상고기간', '2026-12-01')$$, '담당 변호사·직원만');
select tst.as_user('00000000-0000-0000-0000-00000000000d');
select tst.throws('불변기간: 사건방 밖 직원은 등록 못 함', $$select add_deadline(gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '상고기간', '2026-12-01')$$, '담당 변호사·직원만');
select tst.as_user('00000000-0000-0000-0000-00000000000a');
select admin_set_executive('00000000-0000-0000-0000-00000000000b', true);
select tst.check('불변기간: 어드민은 사건 목록 봄', (select jsonb_array_length(deadlines) = 2 from admin_deadline_cases() where room_id = '10000000-0000-0000-0000-000000000001'));
reset role;
set role service_role;
select tst.check('불변기간: 3일 전 알림 (변호사·대표, 2건씩)', enqueue_deadline_alerts('2026-11-07 09:30+09') = 4);
select tst.check('불변기간: 같은 알림 두 번 안 감', enqueue_deadline_alerts('2026-11-07 09:40+09') = 0);
reset role;
select tst.check('불변기간: 받는 사람은 담당 변호사와 대표', (select array_agg(distinct p.login_id order by p.login_id) = '{lawyer,subadmin}' from push_outbox o join profiles p on p.id = o.user_id where o.data->>'kind' = 'deadline'));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select set_deadline_handled('30000000-0000-0000-0000-000000000001', true);
reset role;
set role service_role;
select tst.check('불변기간: 하루 전 24시, 조치 안 한 것만 경고', enqueue_deadline_alerts('2026-11-10 00:05+09') = 2);
reset role;
select tst.check('불변기간: 경고 글 말머리는 사무소', (select count(*) = 1 and bool_and(title like '[부산총괄본부] 불변기간 오늘 만료%이의신청기간') from posts where board::text = 'deadline'));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.check('불변기간: 변호사는 경고 글 봄', (select count(*) = 1 from post_feed where board::text = 'deadline'));
select set_deadline_handled('30000000-0000-0000-0000-000000000002', true);
select tst.check('불변기간: 조치하면 글에 표시', (select bool_and(title like '% (조치 완료)') from post_feed where board::text = 'deadline'));
select set_deadline_handled('30000000-0000-0000-0000-000000000002', false);
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.check('불변기간: 의뢰인은 경고 글 못 봄', (select count(*) = 0 from post_feed where board::text = 'deadline'));
select tst.as_user('00000000-0000-0000-0000-00000000000a');
select tst.check('불변기간: 어드민도 경고 글 봄 (변호사 게시판 전부)', (select count(*) = 1 from post_feed where board::text = 'deadline'));
select tst.check('어드민: 변호사 게시판 봄', can_see_board('lawyer') and can_see_board('advice'));
reset role;
set role service_role;
select tst.check('불변기간: 도과 알림', enqueue_deadline_alerts('2026-11-11 00:05+09') = 2);
reset role;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000a');
select admin_set_deadline_alerts('10000000-0000-0000-0000-000000000001', false);
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select add_deadline('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '상고기간', '2026-12-01');
reset role;
set role service_role;
select tst.check('불변기간: 어드민이 끈 사건은 알림 없음', enqueue_deadline_alerts('2026-12-02 00:05+09') = 0);
reset role;
delete from push_outbox;
update cases set deadline_alerts = true;

-- ── 대륜탑 기일 연동 ──
reset role;
delete from push_outbox;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.throws('대륜탑: 변호사는 사건번호 연결 못 함', $$select admin_set_case_no('10000000-0000-0000-0000-000000000001', '2026가단1')$$, '어드민만');
select tst.throws('대륜탑: 변호사는 엑셀 못 올림', $$select admin_import_daeryuntop('[]')$$, '관리자어드민만');
select tst.throws('대륜탑: 변호사는 직접 못 부름', $$select ingest_daeryuntop_hearing('{}')$$, 'permission denied');
select tst.as_user('00000000-0000-0000-0000-00000000000b');
select admin_set_case_no('10000000-0000-0000-0000-000000000001', '2026가단1');
select tst.throws('대륜탑: 부관리자는 엑셀 못 올림', $$select admin_import_daeryuntop('[]')$$, '관리자어드민만');
select tst.as_user('00000000-0000-0000-0000-00000000000a');
create temp table dt_out as select admin_import_daeryuntop(jsonb_build_array(
  jsonb_build_object('id', 'h1', 'caseNo', '2026가단1', 'name', '변론기일', 'date', (current_date + 20)::text, 'time', '10:30', 'court', '부산지법', 'place', '351호'),
  jsonb_build_object('id', 'h2', 'caseNo', '2026가단1', 'name', '상고기간', 'date', (current_date + 5)::text, 'flags', '["불변"]'::jsonb),
  jsonb_build_object('id', 'h3', 'caseNo', '2026가단1', 'name', '(확인용) 보완수사 확인', 'party', '확인용', 'date', (current_date + 20)::text, 'flags', '["엄수"]'::jsonb),
  jsonb_build_object('id', 'h4', 'caseNo', '없는번호', 'name', '변론기일', 'date', (current_date + 20)::text),
  jsonb_build_object('id', 'h5', 'caseNo', '2026가단1', 'name', '개인 메모', 'official', false, 'date', (current_date + 20)::text),
  jsonb_build_object('id', 'h6', 'caseNo', '2026가단1', 'name', '선고기일', 'date', (current_date - 3)::text)
)) as r;
reset role;
select tst.check('대륜탑: 줄마다 결과', (select array_agg(e->>'result' order by e->>'id') = '{new,deadline,new,skip:연결 안 된 사건,skip:개인 일정,skip:지난 기일}' from dt_out, jsonb_array_elements(r) e), (select r::text from dt_out));
select tst.check('대륜탑: 일반 기일은 사건방 카드 (의뢰인·변호사)', (select count(*) = 2 from push_outbox o join hearing_alerts a on a.id = (o.data->>'alertId')::uuid where a.source = 'daeryuntop' and a.label = '변론기일' and a.place = '부산지법 351호'));
select tst.check('대륜탑: 불변은 불변기간으로', (select count(*) = 1 from case_deadlines where external_id = 'h2' and source = 'daeryuntop'));
select tst.check('대륜탑: 확인용은 변호사·직원에게만 푸시', (select array_agg(p.login_id) = '{lawyer}' from push_outbox o join profiles p on p.id = o.user_id where o.title like '새 기일%' and o.body like '%보완수사%'));
select tst.check('대륜탑: 엄수는 이름에 표시', (select label = '(확인용) 보완수사 확인 [엄수]' and strict and firm_only from hearings where external_id = 'h3'));
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.check('대륜탑: 의뢰인에게 확인용 기일 안 보임', (select count(*) = 0 from hearings where external_id = 'h3') and (select count(*) = 1 from hearings where external_id = 'h1'));
reset role;
delete from push_outbox;
select tst.as_user('');
set role service_role;
select tst.check('대륜탑: 같은 내용은 알림 없음', ingest_daeryuntop_hearing(jsonb_build_object('id', 'h1', 'caseNo', '2026가단1', 'name', '변론기일', 'date', (current_date + 20)::text, 'time', '10:30', 'court', '부산지법', 'place', '351호')) = 'same');
select tst.check('대륜탑: 날짜 바뀌면 기일 변경', ingest_daeryuntop_hearing(jsonb_build_object('id', 'h1', 'caseNo', '2026가단1', 'name', '변론기일', 'date', (current_date + 27)::text, 'time', '10:30', 'court', '부산지법', 'place', '351호', 'flags', '["변경"]'::jsonb)) = 'changed');
select tst.check('대륜탑: 완료 표시는 조치 완료', ingest_daeryuntop_hearing(jsonb_build_object('id', 'h2', 'caseNo', '2026가단1', 'name', '상고기간', 'date', (current_date + 5)::text, 'flags', '["불변","완료"]'::jsonb)) = 'deadline');
select tst.check('대륜탑: 완료면 handled', (select handled_at is not null from case_deadlines where external_id = 'h2'));
select tst.check('대륜탑: 추정은 기일 취소', ingest_daeryuntop_hearing(jsonb_build_object('id', 'h1', 'caseNo', '2026가단1', 'name', '변론기일', 'date', (current_date + 27)::text, 'flags', '["추정"]'::jsonb)) = 'cancelled');
reset role;
select tst.check('대륜탑: 변경·취소 카드', (select array_agg(change::text order by created_at) = '{changed,cancelled}' from hearing_alerts where source = 'daeryuntop' and label like '변론기일%' and created_at >= (select min(created_at) from hearing_alerts where change = 'changed' and source = 'daeryuntop')));
select tst.check('대륜탑: 취소되면 기일 목록에서 빠짐', (select count(*) = 0 from hearings where external_id = 'h1'));
set role service_role;
select ingest_daeryuntop_hearing(jsonb_build_object('id', 'xl:2026가단1:변론기일:a', 'caseNo', '2026가단1', 'name', '변론기일', 'date', (current_date + 10)::text));
select tst.check('대륜탑 엑셀: 같은 이름의 다가오는 기일은 날짜 변경으로', ingest_daeryuntop_hearing(jsonb_build_object('id', 'xl:2026가단1:변론기일:b', 'caseNo', '2026가단1', 'name', '변론기일', 'date', (current_date + 12)::text)) = 'changed');
reset role;
select tst.check('대륜탑: 엄수는 3일 전 미리 알림', enqueue_hearing_reminders(((current_date + 17) + time '09:00') at time zone 'Asia/Seoul') = 1);
select tst.check('대륜탑: 엄수 3일 전은 변호사·직원에게', (select array_agg(distinct p.login_id) = '{lawyer}' from push_outbox o join profiles p on p.id = o.user_id where o.title like '엄수 기일 3일 전%'));
delete from push_outbox;

-- ── 남은 불변기간 아침 알림 ──
reset role;
delete from push_outbox;
update cases set deadline_alerts = true;
insert into case_deadlines (room_id, label, due_date) values
  ('10000000-0000-0000-0000-000000000001', '아침알림A', '2027-03-05'),
  ('10000000-0000-0000-0000-000000000001', '아침알림B', '2027-03-03');
set role service_role;
select tst.check('아침 알림: 8시 30분 전에는 안 보냄', enqueue_limit_digest('2027-03-02 08:29+09') = 0);
select tst.check('아침 알림: 담당 변호사에게 한 번', enqueue_limit_digest('2027-03-02 08:30+09') = 1);
select tst.check('아침 알림: 같은 날 두 번 안 감', enqueue_limit_digest('2027-03-02 09:30+09') = 0);
reset role;
select tst.check('아침 알림: 가까운 것부터', (select o.title like '남은 불변기간 %건' and o.body like 'D-1 아침알림B%' and o.body like '%D-3 아침알림A%' from push_outbox o join profiles p on p.id = o.user_id where p.login_id = 'lawyer'));
delete from push_outbox;
delete from case_deadlines where label like '아침알림%';

-- ── 불변기간 알림 시험 (가짜 사건) ──
reset role;
delete from push_outbox;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000b');
select tst.throws('알림 시험: 부관리자는 못 만듦', $$select admin_seed_test_deadlines()$$, '관리자어드민만');
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.throws('알림 시험: 변호사는 못 만듦', $$select admin_seed_test_deadlines()$$, '관리자어드민만');
select tst.as_user('00000000-0000-0000-0000-00000000000a');
select tst.check('알림 시험: 가짜 불변기간 4건', admin_seed_test_deadlines() = 4);
select tst.throws('알림 시험: 두 번 못 만듦', $$select admin_seed_test_deadlines()$$, '이미 가짜 사건');
select tst.check('알림 시험: 어드민 사건 목록에 보임', (select count(*) = 3 from admin_deadline_cases() where title like '[테스트]%' and not alerts_on));
create temp table tfire as select admin_fire_test_deadline((select d.id from case_deadlines d join cases c on c.room_id = d.room_id where c.title = '[테스트] 사기 형사사건'), 'd0') as r;
select tst.check('알림 시험: 만료일 경고 (시험 변호사와 누른 사람)', (select (r->>'recipients')::int = 2 and r->>'title' like '불변기간 오늘 만료 · [테스트] 사기 형사사건' from tfire));
select tst.throws('알림 시험: 진짜 사건은 못 보냄', $$select admin_fire_test_deadline('30000000-0000-0000-0000-000000000001', 'd3')$$, '가짜 사건의');
reset role;
select tst.check('알림 시험: 경고 글이 불변기간 공지에', (select count(*) = 1 from posts where board::text = 'deadline' and title like '%[테스트] 사기 형사사건 항소기간'));
select tst.check('알림 시험: 받는 사람은 시험 변호사와 관리자', (select array_agg(p.login_id order by p.login_id) = '{admin,lawyer}' from push_outbox o join profiles p on p.id = o.user_id));
delete from push_outbox;
set role service_role;
select tst.check('알림 시험: 예약 작업은 가짜 사건에 안 보냄', enqueue_deadline_alerts() = 0 and enqueue_limit_digest(((current_date) + time '08:40') at time zone 'Asia/Seoul') = 0);
reset role;
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000a');
select tst.check('알림 시험: 지우면 사건 3개', admin_clear_test_deadlines() = 3);
reset role;
select tst.check('알림 시험: 경고 글도 지움', (select count(*) = 0 from posts where title like '%[테스트]%') and (select count(*) = 0 from cases where title like '[테스트]%'));
delete from push_outbox;

-- ── 대화방 이름 바꾸기 ──
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000e');
select tst.throws('방 이름: 마스터가 아니면 못 바꿈', $$select rename_room('10000000-0000-0000-0000-000000000001', '내 사건')$$, '마스터만');
select tst.as_user('00000000-0000-0000-0000-00000000000d');
select tst.throws('방 이름: 참여자가 아니면 못 바꿈', $$select rename_room('10000000-0000-0000-0000-000000000001', '남의 방')$$, '마스터만');
select tst.as_user('00000000-0000-0000-0000-00000000000c');
select tst.throws('방 이름: 30자 넘으면 막힘', $$select rename_room('10000000-0000-0000-0000-000000000001', repeat('가', 31))$$, '30자까지');
select tst.throws('방 이름: 빈 이름 막힘', $$select rename_room('10000000-0000-0000-0000-000000000001', '  ')$$, '적어 주세요');
select rename_room('10000000-0000-0000-0000-000000000001', '  임대차 소송 ');
reset role;
select tst.check('방 이름: 마스터가 바꿈', (select title = '임대차 소송' from rooms where id = '10000000-0000-0000-0000-000000000001'));
update rooms set title = '테스트 사건' where id = '10000000-0000-0000-0000-000000000001';

-- ── AXIOM 표: 앱 계정은 직접 못 읽고 못 씀 (서버 함수만) ──
insert into ax_documents (id, kind, title, created_at, updated_at) values ('d_test', 'note', '기밀 메모', '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z');
set role authenticated;
select tst.as_user('00000000-0000-0000-0000-00000000000a');
select tst.throws('AXIOM: 어드민도 표를 직접 못 읽음', $$select 1/count(*) from ax_documents$$, 'permission denied');
select tst.throws('AXIOM: 어드민도 표에 직접 못 씀', $$insert into ax_approvals (id, kind, tier, title, created_at) values ('x', 'report', 'post', 't', 'n')$$, 'permission denied');
select tst.throws('AXIOM: 예약 깨우기 함수 못 부름', $$select kick_axiom()$$, 'permission denied');
reset role;
set role anon;
select tst.throws('AXIOM: 비로그인 못 읽음', $$select 1/count(*) from ax_runs$$, 'permission denied');
reset role;
select kick_axiom();
select tst.check('AXIOM: 정기 보고 깨우기 함수가 오류 없이 돎', true);

-- ── 로그인 안 한 사람 ──
reset role;
set role anon;
select tst.throws('비로그인: 프로필 못 봄', $$select 1/count(*) from profiles$$, '');
select tst.throws('비로그인: 함수 못 부름', $$select create_post('anon', 'a', 'b', '민사')$$, 'permission denied');
reset role;

select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else detail end as detail from tst.results;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from tst.results;
