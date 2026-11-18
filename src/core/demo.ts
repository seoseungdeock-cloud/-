// 화면 목업용 샘플 내용 (목업 모드 전용). 서버에 붙으면 쓰이지 않고, 단위 테스트에서도 섞이지 않습니다.
// 변호사(샘플 변호사 A)가 보는 사건·상담·기일·불변기간이 충분히 차 보이도록 사건방 5개, 상담방 2개와 대화를 넣어 둡니다.
import type { Reads } from './messenger';
import { BOT_SENDER, SYSTEM_SENDER, type Message, type Room, type User } from './types';

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
/** 오늘(한국 시간)에서 n일 뒤 날짜 */
const kstDay = (n: number) => new Date(Date.now() + 9 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

const CASE_NOTE = '사건수행방입니다. 참여자끼리만 대화하고 AI는 참여하지 않습니다.';

export const demoUsers: User[] = [
  { id: 'u_c2', nickname: '민준', role: 'client', agentAccess: false, membership: 'basic', phone: '010-2000-0002' },
  { id: 'u_c3', nickname: '서연', role: 'client', agentAccess: false, membership: 'basic', phone: '010-2000-0003' },
  { id: 'u_c4', nickname: '지호', role: 'client', agentAccess: false, membership: 'basic', phone: '010-2000-0004' },
  { id: 'u_c5', nickname: '수아', role: 'client', agentAccess: false, membership: 'basic', phone: '010-2000-0005' },
  { id: 'u_c6', nickname: '도윤', role: 'client', agentAccess: false, membership: 'basic', phone: '010-2000-0006' },
  { id: 'u_c7', nickname: '하린', role: 'client', agentAccess: false, membership: 'basic', phone: '010-2000-0007' },
  { id: 'u_c8', nickname: '예준', role: 'client', agentAccess: false, membership: 'basic', phone: '010-2000-0008' },
];

export const demoRooms: Room[] = [
  {
    id: 'r_case2', kind: 'case', mode: 'private', title: '손해배상(교통사고) · 샘플 변호사 A', memberIds: ['u_c2', 'u_lawyer', 'u_staff'], createdBy: 'u_c2', createdAt: ago(24 * 45), officeId: 'of_seoul', lawyerId: 'lw_1',
    caseInfo: {
      title: '손해배상(교통사고)', field: '교통사고·손해배상', stage: '진행', caseNo: '2026가단2210',
      deadlines: [
        { id: 'd2_1', label: '변론기일', date: kstDay(-20), time: '14:00', place: '예시지방법원 제205호 법정', source: 'daeryuntop' },
        { id: 'd2_2', label: '조정기일', date: kstDay(2), time: '14:00', place: '예시지방법원 조정실 2', source: 'daeryuntop', strict: true },
      ],
      documents: [
        { id: 'd2_doc1', name: '교통사고사실확인원.pdf', addedAt: ago(24 * 44) },
        { id: 'd2_doc2', name: '진단서(전치 6주).pdf', addedAt: ago(24 * 40) },
        { id: 'd2_doc3', name: '보험사 손해사정서.pdf', addedAt: ago(24 * 12) },
      ],
      costs: [{ id: 'd2_c1', label: '인지대·송달료', amount: 184000 }],
      progress: [
        { id: 'd2_p1', at: ago(24 * 45), note: '수임' },
        { id: 'd2_p2', at: ago(24 * 38), note: '소장 접수' },
        { id: 'd2_p3', at: ago(24 * 20), note: '1차 변론기일 진행' },
        { id: 'd2_p4', at: ago(24 * 3), note: '조정 회부' },
      ],
    },
  },
  {
    id: 'r_case3', kind: 'case', mode: 'private', title: '이혼 및 재산분할 · 샘플 변호사 A', memberIds: ['u_c3', 'u_lawyer'], createdBy: 'u_c3', createdAt: ago(24 * 70), officeId: 'of_seoul', lawyerId: 'lw_1',
    pinnedBy: ['u_lawyer'],
    caseInfo: {
      title: '이혼 및 재산분할', field: '이혼·가사', stage: '진행', caseNo: '2026드단3300',
      deadlines: [
        { id: 'd3_1', label: '변론준비기일', date: kstDay(9), time: '11:00', place: '예시가정법원 제401호', source: 'daeryuntop' },
        { id: 'd3_2', label: '상대측 서면 제출기한', date: kstDay(5), source: 'daeryuntop', firmOnly: true },
      ],
      documents: [
        { id: 'd3_doc1', name: '혼인관계증명서.pdf', addedAt: ago(24 * 69) },
        { id: 'd3_doc2', name: '재산목록(정리본).xlsx', addedAt: ago(24 * 30) },
      ],
      costs: [],
      progress: [
        { id: 'd3_p1', at: ago(24 * 70), note: '수임' },
        { id: 'd3_p2', at: ago(24 * 60), note: '이혼 조정 신청' },
        { id: 'd3_p3', at: ago(24 * 25), note: '조정 불성립, 소송 이행' },
      ],
      limits: [{ id: 'd3_l1', label: '항소기간', due: kstDay(12), source: 'manual' }],
    },
  },
  {
    id: 'r_case4', kind: 'case', mode: 'private', title: '상속재산분할 · 샘플 변호사 A', memberIds: ['u_c4', 'u_lawyer'], createdBy: 'u_c4', createdAt: ago(24 * 6), officeId: 'of_seoul', lawyerId: 'lw_1',
    caseInfo: {
      title: '상속재산분할', field: '상속', stage: '수임',
      deadlines: [],
      documents: [{ id: 'd4_doc1', name: '가족관계증명서.pdf', addedAt: ago(24 * 5) }],
      costs: [],
      progress: [{ id: 'd4_p1', at: ago(24 * 6), note: '수임' }],
    },
  },
  {
    id: 'r_case5', kind: 'case', mode: 'private', title: '물품대금 청구 · 샘플 변호사 A', memberIds: ['u_c5', 'u_lawyer'], createdBy: 'u_c5', createdAt: ago(24 * 200), officeId: 'of_seoul', lawyerId: 'lw_1',
    caseInfo: {
      title: '물품대금 청구', field: '민사·채권', stage: '종결', caseNo: '2025가소7781',
      deadlines: [{ id: 'd5_1', label: '선고기일', date: kstDay(-40), time: '10:00', place: '예시지방법원 제103호', source: 'daeryuntop' }],
      documents: [{ id: 'd5_doc1', name: '거래명세서 일체.pdf', addedAt: ago(24 * 199) }, { id: 'd5_doc2', name: '판결문.pdf', addedAt: ago(24 * 38) }],
      costs: [{ id: 'd5_c1', label: '인지대·송달료', amount: 96000 }],
      progress: [
        { id: 'd5_p1', at: ago(24 * 200), note: '수임' },
        { id: 'd5_p2', at: ago(24 * 40), note: '선고 (전부 승소)' },
        { id: 'd5_p3', at: ago(24 * 25), note: '종결' },
      ],
    },
  },
  {
    id: 'r_case6', kind: 'case', mode: 'private', title: '임금 체불 · 샘플 변호사 A', memberIds: ['u_c6', 'u_lawyer', 'u_m1'], createdBy: 'u_c6', createdAt: ago(24 * 90), officeId: 'of_seoul', lawyerId: 'lw_1',
    caseInfo: {
      title: '임금 체불', field: '노동', stage: '진행', caseNo: '2026가단4102',
      deadlines: [{ id: 'd6_1', label: '변론기일', date: kstDay(1), time: '15:00', place: '예시지방법원 제302호 법정', source: 'daeryuntop', strict: true }],
      documents: [{ id: 'd6_doc1', name: '근로계약서.pdf', addedAt: ago(24 * 89) }, { id: 'd6_doc2', name: '임금명세서 12개월.zip', addedAt: ago(24 * 85) }],
      costs: [],
      progress: [
        { id: 'd6_p1', at: ago(24 * 90), note: '수임' },
        { id: 'd6_p2', at: ago(24 * 80), note: '노동청 진정 병행' },
        { id: 'd6_p3', at: ago(24 * 50), note: '소장 접수' },
      ],
      limits: [{ id: 'd6_l1', label: '상고기간', due: kstDay(6), source: 'manual' }],
    },
  },
  // 상담방: 아직 수임 전
  { id: 'r_consult1', kind: 'consult', mode: 'private', title: '샘플 변호사 A 상담', memberIds: ['u_c7', 'u_lawyer'], createdBy: 'u_c7', createdAt: ago(5), officeId: 'of_seoul', lawyerId: 'lw_1' },
  { id: 'r_consult2', kind: 'consult', mode: 'private', title: '샘플 변호사 A 상담', memberIds: ['u_c8', 'u_lawyer'], createdBy: 'u_c8', createdAt: ago(30), officeId: 'of_seoul', lawyerId: 'lw_1' },
];

export const demoMessages: Message[] = [
  // 교통사고
  { id: 'dm2_0', roomId: 'r_case2', senderId: SYSTEM_SENDER, kind: 'system', text: CASE_NOTE, at: ago(24 * 45) },
  { id: 'dm2_1', roomId: 'r_case2', senderId: 'u_c2', kind: 'text', text: '보험사에서 합의금 1,200만 원을 제시했는데 받아도 될까요?', at: ago(24 * 4) },
  { id: 'dm2_2', roomId: 'r_case2', senderId: 'u_lawyer', kind: 'text', text: '아직 후유장해 진단이 안 나왔으니 지금 합의하면 손해입니다. 조정기일에서 다시 조율해 보겠습니다.', at: ago(24 * 4 - 1) },
  { id: 'dm2_3', roomId: 'r_case2', senderId: 'u_staff', kind: 'text', text: '조정기일 출석 안내문 등기로 발송했습니다.', at: ago(24 * 2) },
  { id: 'dm2_4', roomId: 'r_case2', senderId: 'u_c2', kind: 'text', text: '조정기일에 저도 꼭 가야 하나요? 회사 연차를 써야 해서요.', at: ago(2.2) },
  // 이혼
  { id: 'dm3_0', roomId: 'r_case3', senderId: SYSTEM_SENDER, kind: 'system', text: CASE_NOTE, at: ago(24 * 70) },
  { id: 'dm3_1', roomId: 'r_case3', senderId: 'u_lawyer', kind: 'text', text: '상대방 재산 조회 결과가 나왔습니다. 정리해서 재산목록에 반영했어요.', at: ago(24 * 9) },
  { id: 'dm3_2', roomId: 'r_case3', senderId: 'u_c3', kind: 'text', text: '감사합니다. 아이 양육비 부분은 어떻게 주장하실 건가요?', at: ago(24 * 8) },
  { id: 'dm3_3', roomId: 'r_case3', senderId: 'u_lawyer', kind: 'text', text: '양육비 산정기준표 상한으로 청구하고, 미지급분은 과거 양육비로 함께 청구합니다.', at: ago(24 * 8 - 0.5) },
  { id: 'dm3_4', roomId: 'r_case3', senderId: 'u_c3', kind: 'text', text: '변론준비기일에 제가 준비할 서류가 있을까요?', at: ago(20) },
  // 상속
  { id: 'dm4_0', roomId: 'r_case4', senderId: SYSTEM_SENDER, kind: 'system', text: CASE_NOTE, at: ago(24 * 6) },
  { id: 'dm4_1', roomId: 'r_case4', senderId: BOT_SENDER, kind: 'bot', text: '[배당 안내] 이 사건은 샘플 변호사 A 변호사가 담당합니다. 사무소: 서울 사무소', at: ago(24 * 6) },
  { id: 'dm4_2', roomId: 'r_case4', senderId: 'u_c4', kind: 'text', text: '형제가 셋인데 둘째가 아버지 생전에 받은 아파트도 나눠야 하는 건가요?', at: ago(24 * 5) },
  { id: 'dm4_3', roomId: 'r_case4', senderId: 'u_lawyer', kind: 'text', text: '특별수익으로 보아 상속분 산정에 반영됩니다. 증여 당시 가액 자료를 모아 주세요.', at: ago(24 * 5 - 2) },
  // 물품대금 (종결)
  { id: 'dm5_0', roomId: 'r_case5', senderId: SYSTEM_SENDER, kind: 'system', text: CASE_NOTE, at: ago(24 * 200) },
  { id: 'dm5_1', roomId: 'r_case5', senderId: 'u_lawyer', kind: 'text', text: '전부 승소 판결입니다. 판결문 올려 드렸고, 강제집행은 상대방 항소 여부 확인 후 진행하겠습니다.', at: ago(24 * 38) },
  { id: 'dm5_2', roomId: 'r_case5', senderId: 'u_c5', kind: 'text', text: '정말 감사합니다 변호사님!', at: ago(24 * 38 + 1) },
  { id: 'dm5_3', roomId: 'r_case5', senderId: 'u_lawyer', kind: 'text', text: '상대방이 항소하지 않아 확정되었습니다. 사건을 종결합니다. 수고 많으셨습니다.', at: ago(24 * 25) },
  // 임금 체불
  { id: 'dm6_0', roomId: 'r_case6', senderId: SYSTEM_SENDER, kind: 'system', text: CASE_NOTE, at: ago(24 * 90) },
  { id: 'dm6_1', roomId: 'r_case6', senderId: 'u_m1', kind: 'text', text: '내일 15:00 변론기일 서류 준비 끝났습니다. 증인 출석 확인도 받았어요.', at: ago(3) },
  { id: 'dm6_2', roomId: 'r_case6', senderId: 'u_c6', kind: 'text', text: '내일 법원 몇 시까지 가면 될까요?', at: ago(1.5) },
  { id: 'dm6_3', roomId: 'r_case6', senderId: 'u_c6', kind: 'text', text: '그리고 사장이 어제 전화로 "반만 주겠다"고 했는데 녹음해 뒀습니다.', at: ago(1.4) },
  // 상담 1
  { id: 'dc1_0', roomId: 'r_consult1', senderId: SYSTEM_SENDER, kind: 'system', text: '상담 신청이 접수되었습니다. 샘플 변호사 A 변호사가 수락하면 대화가 시작됩니다.', at: ago(5) },
  { id: 'dc1_1', roomId: 'r_consult1', senderId: 'u_c7', kind: 'text', text: '전세 계약 만기인데 집주인이 연락이 안 됩니다. 등기부 보니 근저당이 새로 잡혀 있어요. 전세사기인가요?', at: ago(4.8) },
  // 상담 2
  { id: 'dc2_0', roomId: 'r_consult2', senderId: SYSTEM_SENDER, kind: 'system', text: '상담 신청이 접수되었습니다. 샘플 변호사 A 변호사가 수락하면 대화가 시작됩니다.', at: ago(30) },
  { id: 'dc2_1', roomId: 'r_consult2', senderId: 'u_c8', kind: 'text', text: '회사 단톡방에서 저에 대한 허위 사실이 퍼졌습니다. 명예훼손으로 고소하고 싶습니다.', at: ago(29.5) },
  { id: 'dc2_2', roomId: 'r_consult2', senderId: 'u_lawyer', kind: 'text', text: '캡처와 작성자 특정 자료가 있으면 고소 가능합니다. 내방 상담 일정을 잡아 드릴게요.', at: ago(28) },
  { id: 'dc2_3', roomId: 'r_consult2', senderId: 'u_c8', kind: 'text', text: '목요일 오후 가능할까요?', at: ago(27.5) },
];

/** 변호사가 읽은 시각: 교통사고·임금 체불·이혼·상담1 은 새 메시지가 남게 */
export const demoReads: Reads = {
  r_case2: { u_lawyer: ago(24 * 2 - 0.1) },
  r_case3: { u_lawyer: ago(24 * 7) },
  r_case4: { u_lawyer: ago(24 * 5 - 2) },
  r_case5: { u_lawyer: ago(24 * 25) },
  r_case6: { u_lawyer: ago(2.5) },
  r_consult2: { u_lawyer: ago(28) },
};
