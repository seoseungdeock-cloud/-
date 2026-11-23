// 화면 목업용 추가 샘플 (목업 모드 전용) — 화면이 비어 보이지 않도록 구성원·단체방·1:1·대화·게시글을 넉넉히 채웁니다.
// demo.ts(사건방 중심)에 더해 들어가며, 서버에 붙으면 쓰이지 않고 단위 테스트에도 섞이지 않습니다.
import type { Reads } from './messenger';
import { BOT_SENDER, SYSTEM_SENDER, type BoardPost, type Message, type Room, type User } from './types';

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const d = (days: number, hour = 9, min = 0) => ago(days * 24 - hour + 9 - min / 60); // n일 전 hour:min 즈음 (대략)

const firm = (id: string, nickname: string, p: Partial<User>): User => ({ id, nickname, role: 'staff', firm: '대륜', agentAccess: false, membership: 'basic', ...p });

/** 구성원 추가 — 지점·부서·직급이 고르게 */
export const moreUsers: User[] = [
  firm('u_l4', '김서진', { role: 'lawyer', title: '최고총괄변호사', job: '변호사', dept: '경영본부', deptOrder: 1, rankOrder: 5, branch: '본사', officer: true, phone: '010-0100-0004', email: 'sj.kim@example.com', joinedAt: '2015-03-02' }),
  firm('u_l5', '박하늘', { role: 'lawyer', title: '책임변호사', job: '변호사', duty: '소장', dept: '송무서비스관리팀', deptOrder: 6, rankOrder: 2, branch: '서울강남', phone: '010-0100-0005', email: 'hn.park@example.com', joinedAt: '2019-07-15', presence: 'court' }),
  firm('u_l6', '이도현', { role: 'lawyer', title: '선임변호사', job: '변호사', dept: '송무서비스관리팀', deptOrder: 6, rankOrder: 1, branch: '서울강남', phone: '010-0100-0006', email: 'dh.lee@example.com', joinedAt: '2021-01-04' }),
  firm('u_l7', '정유진', { role: 'lawyer', title: '변호사', job: '변호사', dept: '회생파산', deptOrder: 10, rankOrder: 0, branch: '서울회파', phone: '010-0100-0007', email: 'yj.jung@example.com', joinedAt: '2024-03-01' }),
  firm('u_l8', '최민재', { role: 'lawyer', title: '수석변호사', job: '변호사', dept: '부산총괄본부', deptOrder: 5, rankOrder: 3, branch: '부산', phone: '010-0100-0008', email: 'mj.choi@example.com', joinedAt: '2018-09-01', extraDepts: ['증거조사전문센터'] }),
  firm('u_l9', '한지우', { role: 'lawyer', title: '변호사', job: '변호사', dept: '부산총괄본부', deptOrder: 5, rankOrder: 0, branch: '부산', phone: '010-0100-0009', email: 'jw.han@example.com', joinedAt: '2025-02-03', presence: 'meeting' }),
  firm('u_s4', '오세훈', { title: '제너럴매니저', job: '직원', duty: '팀장', dept: '경영지원', deptOrder: 2, rankOrder: 4, branch: '본사', phone: '010-0200-0004', email: 'sh.oh@example.com', joinedAt: '2017-05-08' }),
  firm('u_s5', '강민서', { title: '시니어매니저', job: '직원', dept: '인사', deptOrder: 4, rankOrder: 3, branch: '본사', phone: '010-0200-0005', email: 'ms.kang@example.com', joinedAt: '2020-02-10' }),
  firm('u_s6', '윤서아', { title: '매니저', job: '법률사무원', duty: '책임사무원', dept: '법률사무원/법률비서', deptOrder: 8, rankOrder: 2, branch: '서울강남', phone: '010-0200-0006', email: 'sa.yoon@example.com', joinedAt: '2022-11-01' }),
  firm('u_s7', '임준호', { title: '시니어', job: '법률사무원', dept: '법률사무원/법률비서', deptOrder: 8, rankOrder: 1, branch: '서울강남', phone: '010-0200-0007', email: 'jh.lim@example.com', joinedAt: '2023-06-19' }),
  firm('u_s8', '송다은', { title: '시니어', job: '상담실장', dept: '상담실장', deptOrder: 12, rankOrder: 1, branch: '대전', phone: '010-0200-0008', email: 'de.song@example.com', joinedAt: '2021-09-06', presence: 'meeting' }),
  firm('u_s9', '배수현', { title: '스태프', job: '직원', dept: '홍보마케팅', deptOrder: 9, rankOrder: 0, branch: '본사', phone: '010-0200-0009', email: 'sh.bae@example.com', joinedAt: '2026-01-05' }),
  firm('u_s10', '조은지', { title: '매니저', job: '직원', dept: '회계', deptOrder: 3, rankOrder: 2, branch: '본사', phone: '010-0200-0010', email: 'ej.cho@example.com', joinedAt: '2019-12-02' }),
  firm('u_s11', '신태양', { title: '시니어', job: '직원', dept: '개발', deptOrder: 13, rankOrder: 1, branch: '본사', phone: '010-0200-0011', email: 'ty.shin@example.com', joinedAt: '2024-08-12' }),
];

const ME = 'u_lawyer';
export const moreRooms: Room[] = [
  { id: 'r_all', kind: 'group', mode: 'private', title: '전체 공지방', memberIds: ['u_admin', 'u_admin2', ME, 'u_staff', 'u_m1', 'u_l2', 'u_l3', 'u_l4', 'u_l5', 'u_l6', 'u_l7', 'u_l8', 'u_l9', 'u_s4', 'u_s5', 'u_s6', 'u_s7', 'u_s8', 'u_s9', 'u_s10', 'u_s11'], createdBy: 'u_admin', createdAt: d(120), masters: ['u_admin'],
    notices: [{ id: 'nt_all', messageId: 'ma_5', text: '11월 급여명세서는 25일(화) 오후에 메일로 발송됩니다. 수령 확인 꼭 해 주세요.', by: 'u_s5', at: d(1, 15) }] },
  { id: 'r_lit', kind: 'group', mode: 'private', title: '송무팀 (서울강남)', memberIds: ['u_l5', 'u_l6', 'u_s6', 'u_s7', ME], createdBy: 'u_l5', createdAt: d(90), masters: ['u_l5'] },
  { id: 'r_evid', kind: 'group', mode: 'private', title: '증거조사전문센터 협업', memberIds: [ME, 'u_l8', 'u_s11', 'u_l9'], createdBy: 'u_l8', createdAt: d(40) },
  { id: 'r_hr', kind: 'group', mode: 'private', title: '인사·총무 문의', memberIds: ['u_s5', 'u_s4', 'u_s10', ME, 'u_m1', 'u_staff'], createdBy: 'u_s5', createdAt: d(200) },
  { id: 'r_dev', kind: 'group', mode: 'private', title: 'SKYNET 베타 피드백', memberIds: ['u_s11', 'u_admin', ME, 'u_l6', 'u_s9', 'u_m1'], createdBy: 'u_s11', createdAt: d(14), pinnedBy: [ME] },
  { id: 'r_d_l8', kind: 'direct', mode: 'private', title: '최민재', memberIds: [ME, 'u_l8'], createdBy: ME, createdAt: d(60) },
  { id: 'r_d_l5', kind: 'direct', mode: 'private', title: '박하늘', memberIds: [ME, 'u_l5'], createdBy: 'u_l5', createdAt: d(30) },
  { id: 'r_d_s6', kind: 'direct', mode: 'private', title: '윤서아', memberIds: [ME, 'u_s6'], createdBy: 'u_s6', createdAt: d(10) },
  { id: 'r_d_admin', kind: 'direct', mode: 'private', title: '승덕', memberIds: [ME, 'u_admin'], createdBy: 'u_admin', createdAt: d(80) },
  { id: 'r_d_s8', kind: 'direct', mode: 'private', title: '송다은', memberIds: [ME, 'u_s8'], createdBy: 'u_s8', createdAt: d(3) },
];

const t = (id: string, roomId: string, senderId: string, text: string, at: string, extra: Partial<Message> = {}): Message => ({ id, roomId, senderId, kind: 'text', text, at, ...extra });
const sys = (id: string, roomId: string, text: string, at: string): Message => ({ id, roomId, senderId: SYSTEM_SENDER, kind: 'system', text, at });
const bot = (id: string, roomId: string, text: string, at: string, botName?: string, buttons?: { label: string; url: string }[]): Message => ({ id, roomId, senderId: BOT_SENDER, kind: 'bot', text, at, botName, buttons });
const file = (id: string, name: string, size: number, mime?: string) => ({ id, kind: 'file' as const, name, uri: `blob:demo/${id}`, size, mime });
const img = (id: string, name: string, size: number) => ({ id, kind: 'image' as const, name, uri: `https://picsum.photos/seed/${id}/640/420`, size, mime: 'image/jpeg' });

export const moreMessages: Message[] = [
  // ── 전체 공지방 ──
  sys('ma_0', 'r_all', '승덕 님이 방을 만들었습니다.', d(120)),
  t('ma_1', 'r_all', 'u_admin', '전 구성원 공지방입니다. 급여·휴무·시스템 공지는 여기로 올라갑니다. 잡담은 부서방을 이용해 주세요 🙏', d(120, 9, 5)),
  t('ma_2', 'r_all', 'u_s4', '[총무] 본사 5층 복합기 교체 작업이 내일(목) 오전 10~12시 진행됩니다. 급한 출력은 4층을 이용해 주세요.', d(6, 16, 40), { reactions: { u_s6: '👍', u_l6: '👍', u_m1: '🙏' } }),
  t('ma_3', 'r_all', 'u_s9', '[홍보] 11월 뉴스레터 초안 공유드립니다. 인터뷰 응해 주신 박하늘 변호사님 감사합니다!', d(4, 11, 20), { attachments: [file('fa_1', '대륜 뉴스레터 2026-11 초안.pdf', 2_840_000, 'application/pdf')] }),
  t('ma_4', 'r_all', 'u_l5', '제가 더 감사하죠 ㅎㅎ 사진 잘 나왔네요', d(4, 11, 48), { replyTo: 'ma_3' }),
  t('ma_5', 'r_all', 'u_s5', '[인사] 11월 급여명세서는 25일(화) 오후에 메일로 발송됩니다. 수령 확인 꼭 해 주세요.', d(1, 15), { mentions: ['all'] }),
  t('ma_6', 'r_all', 'u_s11', '[개발] SKYNET 할 일·파일함 기능이 추가됐습니다. 사용법은 게시판 공지 참고해 주세요. 불편한 점은 「SKYNET 베타 피드백」방으로!', ago(5.2), { reactions: { u_admin: '👍', u_l6: '❤️', u_s9: '👍', u_m1: '👍', u_l8: '😮' } }),
  bot('ma_7', 'r_all', '【대륜탑 알림】 11/24(월) 09:30 전 지점 화상 조회 — 참석 링크가 캘린더에 등록되었습니다.', ago(1.1), '대륜탑', [{ label: '캘린더에서 보기', url: 'https://example.com/cal' }]),

  // ── 송무팀 ──
  sys('ml_0', 'r_lit', '박하늘 님이 방을 만들었습니다.', d(90)),
  t('ml_1', 'r_lit', 'u_l5', '이번 주 기일 정리합니다. 월 10:00 이도현(강남 민사3), 수 14:00 저(가정 2단독), 금 11:00 샘플 변호사 A(부산 민사1). 서류 전날까지 윤서아 매니저 확인 부탁.', d(3, 8, 50)),
  t('ml_2', 'r_lit', 'u_s6', '네, 월·수 건은 준비 끝났고 금요일 부산 건은 증인신문사항 받으면 바로 정리하겠습니다.', d(3, 9, 12), { replyTo: 'ml_1' }),
  t('ml_3', 'r_lit', ME, '증인신문사항 초안입니다. 쟁점 2(과실비율)에 집중했고, 상대 증인 탄핵용 질문은 뒤에 따로 묶었어요.', d(2, 17, 30), { attachments: [file('fl_1', '증인신문사항_초안_v2.docx', 88_000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')] }),
  t('ml_4', 'r_lit', 'u_l6', '탄핵 질문 7번은 유도신문으로 이의 들어올 것 같아요. "~한 것 아닙니까" 대신 사실 확인형으로 바꾸시죠.', d(2, 18, 5), { replyTo: 'ml_3' }),
  t('ml_5', 'r_lit', ME, '좋은 지적이네요. 수정하겠습니다 👍', d(2, 18, 20), { reactions: { u_l6: '👍' } }),
  t('ml_6', 'r_lit', 'u_s7', '월요일 민사3 건 판결 선고됐습니다. 일부 승소(청구액의 70%). 판결문 원본 수령 후 사건방에 올리겠습니다.', d(1, 11, 40), { reactions: { u_l5: '👏', u_l6: '👏', u_s6: '👏', [ME]: '👏' } }),
  t('ml_7', 'r_lit', 'u_l5', '수고하셨습니다. 항소 여부는 의뢰인과 상의 후 수요일까지 결정하겠습니다.', d(1, 12, 2)),
  bot('ml_8', 'r_lit', '【기일 알림】 내일 11:00 변론기일 — 2026가단4102 임금 체불 (예시지방법원 제302호). 담당: 샘플 변호사 A', ago(18), '대륜탑'),
  t('ml_9', 'r_lit', 'u_s6', '@샘플 변호사 A 증인신문사항 최종본 사건방 파일함에 올렸습니다. 출력본 3부도 책상에 두었어요.', ago(2.3), { mentions: [ME] }),

  // ── 증거조사전문센터 협업 ──
  sys('me_0', 'r_evid', '최민재 님이 방을 만들었습니다.', d(40)),
  t('me_1', 'r_evid', 'u_l8', '교통사고 건 블랙박스 영상 포렌식 의뢰합니다. 충돌 직전 3초 구간 속도 산출이 필요해요.', d(12, 14)),
  t('me_2', 'r_evid', 'u_s11', '원본 파일 받았습니다. 프레임 단위 분석 돌려서 금요일까지 보고서 드릴게요.', d(12, 14, 30), { replyTo: 'me_1' }),
  t('me_3', 'r_evid', 'u_s11', '분석 결과: 충돌 직전 상대 차량 추정 속도 68~72km/h (제한속도 50). 보고서 첨부합니다.', d(8, 16, 10), { attachments: [file('fe_1', '블랙박스_속도분석_보고서.pdf', 4_120_000, 'application/pdf'), img('fe_2', '프레임_추출_01.jpg', 380_000)] }),
  t('me_4', 'r_evid', ME, '이 정도면 과실비율 주장 근거로 충분하겠네요. 감정인 의견서 형식으로도 받을 수 있을까요?', d(8, 16, 40), { replyTo: 'me_3' }),
  t('me_5', 'r_evid', 'u_l8', '센터 명의 의견서로 발급 가능합니다. 비용은 사건 비용으로 처리하죠.', d(8, 17), { reactions: { [ME]: '🙏' } }),
  t('me_6', 'r_evid', 'u_l9', '저도 유사 건(2026가단5120)이 있는데 같은 방식으로 분석 가능할까요?', d(1, 10, 20)),

  // ── 인사·총무 ──
  sys('mh_0', 'r_hr', '강민서 님이 방을 만들었습니다.', d(200)),
  t('mh_1', 'r_hr', 'u_m1', '연차 사용 신청은 대륜탑에서 하면 되나요, 아니면 여기에 말씀드려야 하나요?', d(9, 10)),
  t('mh_2', 'r_hr', 'u_s5', '대륜탑 > 근태 > 휴가신청에서 올려 주시면 됩니다. 급한 당일 연차만 여기로 먼저 알려 주세요.', d(9, 10, 15), { replyTo: 'mh_1' }),
  t('mh_3', 'r_hr', ME, '12월 2~3일 연차 신청했습니다. 기일 없는 날로 맞췄어요.', d(5, 9, 30)),
  t('mh_4', 'r_hr', 'u_s5', '확인했습니다 👍', d(5, 9, 41), { replyTo: 'mh_3' }),
  t('mh_5', 'r_hr', 'u_s10', '[회계] 10월 법인카드 사용내역 소명 마감이 금요일입니다. 영수증 누락 건은 대륜탑 경비처리에 올려 주세요.', d(2, 14)),
  t('mh_6', 'r_hr', 'u_s4', '본사 주차 등록 차량 변경하신 분은 저에게 차량번호 알려 주세요. 11월 말 일괄 갱신합니다.', ago(26)),

  // ── SKYNET 베타 피드백 ──
  sys('md_0', 'r_dev', '신태양 님이 방을 만들었습니다.', d(14)),
  t('md_1', 'r_dev', 'u_s11', 'SKYNET 베타 사용해 주셔서 감사합니다. 버그·개선 요청은 여기에 자유롭게 올려 주세요. 스크린샷 첨부해 주시면 더 좋습니다.', d(14, 10)),
  t('md_2', 'r_dev', 'u_l6', '다크모드에서 내 말풍선 글자가 잘 안 보였는데 오늘 업데이트로 좋아졌네요. 답장 인용도 훨씬 낫습니다.', d(2, 13, 20), { reactions: { u_s11: '🙏', u_admin: '👍' } }),
  t('md_3', 'r_dev', 'u_s9', '게시판 글 쓸 때 사진 여러 장 한 번에 올리기가 있으면 좋겠어요.', d(2, 15), { attachments: [img('fd_1', '게시판_글쓰기_화면.png', 210_000)] }),
  t('md_4', 'r_dev', 'u_s11', '이미 가능합니다! 「파일」 눌러서 여러 장 선택하시면 돼요. 안내가 부족했네요, 도움말에 추가하겠습니다.', d(2, 15, 12), { replyTo: 'md_3' }),
  t('md_5', 'r_dev', ME, '할 일에 담당자 여러 명 지정되는 거 좋네요. 팀 단위 지시할 때 편합니다.', d(1, 9, 5)),
  t('md_6', 'r_dev', 'u_m1', '파일함 휴지통 덕분에 어제 잘못 지운 당직표 살렸습니다 😂', ago(20), { reactions: { u_s11: '😂', [ME]: '😂', u_l6: '👍' } }),
  t('md_7', 'r_dev', 'u_admin', 'PC 앱(Windows/Mac) 설치 파일도 곧 배포합니다. 트레이 알림 테스트해 주실 분 손!', ago(3), { reactions: { u_s11: '🙋', u_l6: '🙋' } }),

  // ── 1:1 최민재 ──
  t('m8_1', 'r_d_l8', ME, '민재 변, 교통사고 건 포렌식 의견서 비용 견적 받으셨어요?', d(6, 11)),
  t('m8_2', 'r_d_l8', 'u_l8', '네 55만 원이요. 의뢰인한테 설명드리고 진행하면 될 것 같아요.', d(6, 11, 20)),
  t('m8_3', 'r_d_l8', ME, '오케이. 조정기일 전에 받으면 좋겟네요.', d(6, 11, 22)),
  t('m8_4', 'r_d_l8', 'u_l8', '목요일 점심 어때요? 부산 지점 신입 변호사 소개도 하고 싶고', d(1, 10, 30)),
  t('m8_5', 'r_d_l8', ME, '좋아요. 12시 1층 로비에서 봐요', d(1, 10, 35), { reactions: { u_l8: '👍' } }),

  // ── 1:1 박하늘 ──
  t('m5_1', 'r_d_l5', 'u_l5', 'A 변호사님, 금요일 부산 기일 끝나고 바로 서울 복귀하시나요? 송무팀 회식 저녁 7시인데', d(2, 16)),
  t('m5_2', 'r_d_l5', ME, '기일이 11시라 오후 KTX 타면 6시쯤 도착해요. 참석할게요!', d(2, 16, 10)),
  t('m5_3', 'r_d_l5', 'u_l5', '👍 장소는 강남역 근처로 잡을게요', d(2, 16, 12)),
  t('m5_4', 'r_d_l5', 'u_l5', '민사3 건 항소 여부, 의뢰인이 항소 안 하기로 했대요. 수요일 전에 결론 나서 다행', ago(4)),

  // ── 1:1 윤서아 ──
  t('m6_1', 'r_d_s6', 'u_s6', '변호사님, 임금 체불 건 증인 출석요구서 송달 완료됐습니다. 증인 본인 확인 전화도 드렸어요.', d(1, 14)),
  t('m6_2', 'r_d_s6', ME, '감사합니다. 증인이 긴장하시는 것 같으면 기일 당일 30분 일찍 오시라고 해 주세요.', d(1, 14, 8)),
  t('m6_3', 'r_d_s6', 'u_s6', '네, 10:30에 법원 앞에서 만나기로 했습니다.', d(1, 14, 15)),
  t('m6_4', 'r_d_s6', 'u_s6', '내일 출력본 3부 책상에 뒀고, 파일함에도 올렸습니다. 확인 부탁드려요 🙏', ago(2.2), { attachments: [file('f6_1', '증인신문사항_최종.pdf', 142_000, 'application/pdf')] }),

  // ── 1:1 승덕 ──
  t('mad_1', 'r_d_admin', 'u_admin', 'A 변호사, 부산 상담팀 11월 수임률 자료 다음 주 경영회의에서 5분만 발표해 줄 수 있어요?', d(4, 18)),
  t('mad_2', 'r_d_admin', ME, '네 가능합니다. 상담 42건 중 수임 19건이라 45%쯤 되는데, 전월 대비 흐름까지 정리해서 가져가겠습니다.', d(4, 18, 20)),
  t('mad_3', 'r_d_admin', 'u_admin', '좋아요. 자료는 회의 전날까지 공유 폴더에', d(4, 18, 22), { reactions: { [ME]: '👍' } }),

  // ── 1:1 송다은 (새 메시지) ──
  t('ms8_1', 'r_d_s8', 'u_s8', '변호사님 안녕하세요, 대전 상담실장 송다은입니다. 대전에서 들어온 교통사고 상담인데 부산 건과 유사해서 자문 좀 구하고 싶습니다.', ago(0.8)),
  t('ms8_2', 'r_d_s8', 'u_s8', '상대 보험사가 과실 70:30을 주장하는데 블랙박스 분석으로 뒤집은 사례가 있으시다고 들었어요.', ago(0.75)),
];

/** 변호사가 읽은 시각 — 송무팀·전체 공지·베타·송다은 1:1 은 안 읽은 글이 남게 */
export const moreReads: Reads = {
  r_all: { [ME]: ago(6) },
  r_lit: { [ME]: ago(19) },
  r_evid: { [ME]: d(1, 11) },
  r_hr: { [ME]: ago(30) },
  r_dev: { [ME]: ago(21) },
  r_d_l8: { [ME]: d(1, 10, 36) },
  r_d_l5: { [ME]: d(2, 16, 13) },
  r_d_s6: { [ME]: d(1, 14, 16) },
  r_d_admin: { [ME]: d(4, 18, 23) },
};

const post = (id: string, p: Omit<BoardPost, 'id' | 'votes' | 'comments'> & Partial<Pick<BoardPost, 'votes' | 'comments'>>): BoardPost => ({ id, votes: {}, comments: [], ...p });
const cm = (id: string, authorId: string, text: string, at: string, parentId?: string) => ({ id, authorId, text, at, votes: {}, parentId });

export const morePosts: BoardPost[] = [
  post('p_notice2', { board: 'notice', authorId: 'u_admin', at: d(2, 9), field: '', title: '[필독] 2026년 연말 휴무 및 당직 안내', body: '12월 25일(목)·1월 1일(목)은 전 지점 휴무입니다. 휴무일 긴급 연락은 당직 변호사(게시판 당직표 참고)에게 연결됩니다.\n\n연말 종무식은 12월 30일(화) 16시 본사, 지점은 화상 연결.', mustReadUntil: new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10), readCount: 11, readByMe: false, comments: [cm('c_n2_1', 'u_s5', '당직표는 12/5까지 인사팀에서 올리겠습니다.', d(2, 10))] }),
  post('p_notice3', { board: 'notice', authorId: 'u_s11', at: d(5, 14), field: '', title: 'SKYNET 업데이트 — 할 일·파일함·노트·고객 연락처 추가', body: '네이버웍스에서 쓰던 기능이 SKYNET 에 들어왔습니다.\n\n· 할 일: 담당자 여러 명, 기한, 사건방 연결\n· 파일함: 회사/부서/대화방 범위, 휴지통 30일\n· 노트: 부서 공지·당직표처럼 함께 보는 메모\n· 고객 연락처: 보험사·법원 등 바깥 연락처를 태그로\n\n자세한 사용법은 첨부 안내서를 봐 주세요.', attachments: [file('fp_1', 'SKYNET_새기능_안내.pdf', 1_920_000, 'application/pdf')], readCount: 34, readByMe: true, votes: { u_l6: 1, u_m1: 1, u_s6: 1, u_l5: 1 }, comments: [cm('c_n3_1', 'u_l6', '파일함 외부 링크 공유도 되나요? 의뢰인에게 자료 보낼 때 필요합니다.', d(5, 15)), cm('c_n3_2', 'u_s11', '됩니다. 파일 관리 → 외부 링크로 공유에서 만료일·비밀번호 설정 가능해요.', d(5, 15, 20), 'c_n3_1')] }),
  post('p_lawyer1', { board: 'lawyer', authorId: 'u_l5', at: d(3, 20), field: '부동산·임대차', title: '전세사기 피해자 특별법 개정 후 우선매수권 실무 정리', body: '개정 특별법 시행 이후 경매 절차에서 피해자 우선매수권 행사 요건이 완화됐습니다. 최근 진행한 3건 기준으로 법원마다 요구 서류가 조금씩 달라 정리해 둡니다.\n\n1. 피해자 결정문 원본\n2. 임대차계약서·확정일자\n3. 매수신청보증금 (최저가의 10%)\n\n서울중앙은 3번을 당일 납부로 받아 줬고, 수원은 사전 납부를 요구했습니다.', votes: { [ME]: 1, u_l6: 1, u_l7: 1, u_l8: 1, u_l2: 1 }, comments: [cm('c_l1_1', 'u_l7', '회생파산 쪽에서도 참고가 됩니다. 피해자가 개인회생 중인 경우 처리 사례 있으신가요?', d(3, 21)), cm('c_l1_2', 'u_l5', '한 건 있는데 회생법원 허가 받아서 진행했어요. 따로 정리해서 올릴게요.', d(3, 21, 30), 'c_l1_1')] }),
  post('p_lawyer2', { board: 'lawyer', authorId: ME, at: d(7, 18), field: '음주운전·교통사고', title: '블랙박스 속도분석으로 과실비율 뒤집은 사례 공유', body: '상대 보험사가 70:30(우리 과실 70)을 주장한 건입니다. 증거조사전문센터에서 프레임 단위 속도 분석을 받아 상대 차량이 제한속도 50km 구간에서 70km로 진입했음을 입증, 조정에서 40:60으로 역전됐습니다.\n\n센터 의견서 비용 55만 원, 소요 5일. 비슷한 건 있으시면 센터 최민재 변호사님께 문의하세요.', votes: { u_l5: 1, u_l6: 1, u_l9: 1, u_l8: 1, u_l4: 1, u_l3: 1 }, comments: [cm('c_l2_1', 'u_l9', '저도 유사 건 있어서 바로 문의드렸습니다. 감사합니다!', d(1, 10, 25))] }),
  post('p_lawyer3', { board: 'lawyer', authorId: 'u_l7', at: d(10, 11), field: '회생·파산', title: '개인회생 변제계획 인가 후 추가 채무 발견 시 대응', body: '인가 결정 후 누락된 채권자가 나타난 경우 변제계획 변경 신청으로 처리했습니다. 채권자 목록 수정 → 변경안 제출 → 채권자 집회 없이 서면 결의로 2개월 소요. 서식 첨부합니다.', attachments: [file('fp_2', '변제계획_변경신청서_서식.hwp', 64_000)], votes: { u_l5: 1, u_l2: 1 } }),
  post('p_advice1', { board: 'advice', authorId: 'u_l9', at: d(1, 16), field: '민사', title: '소액사건에서 상대방이 답변서 없이 불출석했을 때', body: '피고가 답변서도 없고 첫 기일에 불출석했습니다. 자백간주로 바로 선고 신청하면 되는지, 아니면 한 번 더 기일을 잡는 게 안전한지 선배님들 의견 구합니다.', comments: [cm('c_a1_1', 'u_l6', '소액은 보통 바로 선고 가능합니다. 다만 송달이 공시송달이면 자백간주가 안 되니 송달 방식 먼저 확인하세요.', d(1, 16, 30)), cm('c_a1_2', 'u_l5', '이도현 변 말이 맞고, 재판부에 "변론 종결 후 선고기일 지정 요청" 한 줄 넣어 두면 깔끔합니다.', d(1, 17), 'c_a1_1'), cm('c_a1_3', 'u_l9', '감사합니다! 송달은 교부송달이라 바로 진행하겠습니다.', d(1, 17, 10))] }),
  post('p_advice2', { board: 'advice', authorId: 'u_l2', at: d(4, 10), field: '이혼·가사', title: '양육비 직접지급명령 신청 요건 중 "2회 이상 미지급" 해석', body: '2회 연속이어야 하는지, 누적 2회면 되는지 재판부마다 다른 것 같습니다. 서울가정법원 최근 실무 아시는 분?', comments: [cm('c_a2_1', 'u_l5', '서울가정은 누적 2회로 받아 줍니다. 다만 신청서에 미지급 내역표를 월별로 명확히 적어야 해요.', d(4, 11))] }),
  post('p_praise2', { board: 'praise', authorId: 'u_s6', at: d(1, 12), field: '노동', title: '임금 체불 사건 증인 섭외해 주신 샘플 매니저님', body: '증인이 출석을 꺼리셨는데 샘플 매니저님이 직접 찾아가 설득해 주셨습니다. 덕분에 내일 기일 증인신문 진행할 수 있게 됐어요. 감사합니다!', votes: { [ME]: 1, u_l5: 1, u_s7: 1, u_l6: 1, u_staff: 1, u_m1: 1, u_s5: 1 }, comments: [cm('c_p2_1', 'u_m1', '아이고 부끄럽네요 ㅎㅎ 증인분이 좋은 분이셨어요.', d(1, 12, 40))] }),
  post('p_praise3', { board: 'praise', authorId: 'u_l6', at: d(6, 19), field: '민사', title: '민사3 건 자료 정리 끝판왕 임준호 시니어', body: '12개월치 거래내역 300장을 쟁점별로 색인해서 정리해 주셨습니다. 재판부도 "정리가 잘 됐다"고 한마디. 이런 분과 일하는 게 복입니다.', votes: { u_l5: 1, u_s6: 1, [ME]: 1, u_s4: 1 } }),
  post('p_event2', { board: 'event', authorId: 'u_s5', at: d(3, 9), field: '', title: '[결혼] 송무팀 이도현 변호사 결혼 (12/13 토)', body: '일시: 12월 13일(토) 12:30\n장소: 예시 웨딩홀 3층 그랜드볼룸\n\n축하 많이 해 주세요 🎉', votes: { u_l5: 1, [ME]: 1, u_s6: 1, u_s7: 1, u_admin: 1, u_m1: 1, u_l8: 1, u_l9: 1 }, comments: [cm('c_e2_1', 'u_l5', '축하합니다!! 송무팀 다 갑니다', d(3, 9, 20)), cm('c_e2_2', ME, '축하드려요 🎉', d(3, 10))] }),
  post('p_event3', { board: 'event', authorId: 'u_s9', at: d(8, 15), field: '', title: '[행사] 11월 전 직원 산행 — 금정산 (11/29 토)', body: '09:00 범어사 입구 집결, 12:30 하산 후 점심. 참가 신청은 이 글 댓글로! 지점 분들 교통비 지원됩니다.', votes: {}, comments: [cm('c_e3_1', 'u_l8', '부산 지점 5명 참가합니다', d(8, 16)), cm('c_e3_2', 'u_s10', '회계팀 2명', d(7, 9)), cm('c_e3_3', ME, '참가요~', d(7, 10))] }),
  post('p_anon1', { board: 'anon', authorId: 'u_s7', at: d(2, 22), field: '기타 형사범죄', title: '야근 많은 시즌인데 다들 저녁 어떻게 해결하시나요', body: '송무 시즌이라 9시 넘게 남는 날이 많은데 매번 배달도 지겹고… 본사 근처 괜찮은 곳 추천 좀', aliases: { u_s7: 1, u_s9: 2, u_l9: 3 }, comments: [cm('c_an1_1', 'u_s9', '본사 뒷골목 국밥집 10시까지 해요. 가성비 최고', d(2, 22, 30)), cm('c_an1_2', 'u_l9', '야근식대 한도 좀 올려 주시면 좋겠네요 (익명이니까…)', d(2, 23))] , votes: { u_s9: 1, u_l9: 1, u_s6: 1 } }),
  post('p_anon2', { board: 'anon', authorId: 'u_l9', at: d(5, 13), field: '민사', title: '신입인데 선배 변호사님께 질문 타이밍이 어렵습니다', body: '다들 바쁘신 게 보여서 언제 물어봐야 할지 고민입니다. 다른 분들은 어떻게 하셨나요?', aliases: { u_l9: 1, u_l6: 2, u_l5: 3 }, comments: [cm('c_an2_1', 'u_l6', '메시지로 "잠깐 시간 될 때 5분만" 하고 질문 요지를 미리 적어 두면 좋아요. 다들 그렇게 배웠어요.', d(5, 14)), cm('c_an2_2', 'u_l5', '질문 안 하는 게 제일 위험합니다. 바빠 보여도 물어봐요.', d(5, 14, 20))], votes: { u_l6: 1, u_l5: 1, u_s6: 1, u_l2: 1 } }),
  post('p_sky2', { board: 'skyzai', authorId: 'u_l6', at: d(4, 17), field: '', title: 'SKYZAI 서면 초안 기능 써 본 후기', body: '답변서 초안을 SKYZAI로 뽑아 봤는데 쟁점 정리는 괜찮고 판례 인용은 꼭 원문 확인해야 합니다. 2번 중 1번은 판결 번호가 틀렸어요. 그래도 초안 시간은 절반 줄었습니다.', votes: { [ME]: 1, u_l7: 1, u_s11: 1 }, comments: [cm('c_s2_1', 'u_s11', '판례 인용 검증 기능 개발 중입니다. 12월 중 반영 예정이에요.', d(4, 17, 40))] }),
];
