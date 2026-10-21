// 앱 상태 저장소. 서버 주소가 없으면 기기 메모리에만 있고 앱을 다시 열면 처음 상태로 돌아갑니다.
// 서버(Supabase)가 붙으면 로그인할 때 서버 데이터를 받아 오고, 동작마다 같은 변경을 서버에 보냅니다 (mirror).
// 화면은 어느 쪽이든 이 상태만 봅니다.
import { AppState } from 'react-native';
import { getAi } from './ai';
import { AI_HELP, needsAgentAccess, parseAiCommand, type AiCommand } from './commands';
import { checkCompliance } from './compliance';
import { similarity } from './text';
import type { DecisionRecord } from './knowledge';
import { opinionFor } from './knowledge';
import { titleFrom, type ProgramRequest } from './builder';
import { newId, nowIso, useServerIds } from './ids';
import { loadAll, loadMessagesSince, messagesFromRows, remoteOps, type Remote } from './remote';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { loginEmail, reasonOf, supabase } from './supabase';
import {
  applyBudget,
  CHANNEL_LABEL,
  DEFAULT_GUARDRAILS,
  mostSimilar,
  planFromCommand,
  rankPerformance,
  type Channel,
  type ContentItem,
  type Performance,
  type Plan,
} from './marketing';
import { summarizeMeeting, type MeetingNotes } from './meeting';
import { asksCaseInfo, assignmentText, caseStatusText } from './case-bot';
import { AUTH_TTL_MIN, canReceiveAuthCodes, checkAuthCode, type AuthCode } from './auth-codes';
import { digestPosts, LAW_BOT, type LawUpdate } from './law-digest';
import { deadlineCasesFrom, dueLimitPosts, LIMIT_BOT, limitLawyers, limitPost, limitPushText, type LimitSlot } from './deadlines';
import { classify, type DtHearing, type DtResult } from './daeryuntop';
import { alertText, CHANGE_LABEL, recipientsOf, whenLabel } from './hearings';
import { isSelfRoom, SELF_ROOM_TITLE } from './calendar';
import { boardOf, canSeeBoard, canWriteBoard, formatUntil, MAX_ATTACHMENTS, needsField, reportTarget, restrictedUntil, toggleVote } from './board';
import { displayName, isMaster, parseMentions, roomMasters, type Reads } from './messenger';
import { findLawyer } from './offices';
import { aliasOf, canManageOpen, canUseOpenChat, checkAlias, checkOpenPassword, isOpenMember, OPEN_MAX_OPTIONS, parseTags } from './open-chat';
import { procedureReply } from './procedures';
import { roomAiInput, roomAiSystem } from './room-ai';
import { aiAnswerLevel, canCreateRoom, canJoinMembership, canSeeSuggestions, canUseAgents, type RoomCheck } from './rooms';
import { latest, parseRows, refreshTemplate, type DataRow, type ImageTemplate } from './templates';
import {
  AI_SENDER,
  BOT_SENDER,
  SYSTEM_SENDER,
  type Account,
  type Attachment,
  type BoardKind,
  type Hearing,
  type HearingAlert,
  type HearingChange,
  type HearingSource,
  type Suggestion,
  type SuggestionStatus,
  type BoardPost,
  type NoteThread,
  type BoardReport,
  type CaseInfo,
  type DeadlineCase,
  type FixedDeadline,
  type Message,
  type NotifyLevel,
  type OpenMessage,
  type OpenRoom,
  type Presence,
  type Room,
  type RoomKind,
  type RoomMode,
  type User,
  type Role,
} from './types';

export type State = {
  /** 로그인 전에는 null */
  currentUserId: string | null;
  users: User[];
  accounts: Account[];
  rooms: Room[];
  messages: Message[];
  meetingNotes: Record<string, MeetingNotes>;
  decisions: DecisionRecord[];
  templates: ImageTemplate[];
  programs: ProgramRequest[];
  plans: Plan[];
  contents: ContentItem[];
  budgets: Partial<Record<Channel, number>>;
  performance: Performance[];
  /** 라잇나우 변호사 id → 앱 사용자 id (변호사가 가입하면 연결) */
  lawyerAccounts: Record<string, string>;
  posts: BoardPost[];
  notes: NoteThread[];
  reports: BoardReport[];
  /** 게시판 이용 제한: 사용자 id → 해제 시각 */
  boardBans: Record<string, string>;
  /** 방 id → 사용자 id → 마지막으로 읽은 시각 (읽음 수·안 읽은 수) */
  reads: Reads;
  /** 사용자 id → 즐겨찾기한 사람 */
  favorites: Record<string, string[]>;
  openRooms: OpenRoom[];
  openMessages: OpenMessage[];
  /** 사용자 id → 확인한 공지 글 id (게시판 공지 팝업) */
  noticeSeen: Record<string, string[]>;
  /** 라잇나우 건의사항 (관리자어드민이 봄) */
  suggestions: Suggestion[];
  /** 대륜탑 인증코드 (메신저 '대륜탑 인증' 봇) */
  authCodes: AuthCode[];
  /** 기일 알람 (의뢰인·변호사 모두 확인할 때까지) */
  hearingAlerts: HearingAlert[];
  /** 서버 연결 시 어드민: 사건별 불변기간 (어드민은 사건방 참여자가 아니어서 따로 받음) */
  deadlineCases?: DeadlineCase[];
  /** 서버 연결 시: 저장된 로그인을 확인하는 중이면 false */
  booted: boolean;
  /** 서버 연결 시: 서버에 저장하지 못한 사유 (화면 위에 잠깐 표시) */
  syncError?: string;
};

const T0 = '2026-10-13T09:00:00.000Z';
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
/** 오늘(한국 시간)에서 n일 뒤 날짜 */
/** 불변기간 알림 시험용 가짜 사건 제목 머리 */
export const TEST_PREFIX = '[테스트]';
const kstDay = (n: number) => new Date(Date.now() + 9 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

export function initialState(): State {
  const users: User[] = [
    { id: 'u_admin', superAdmin: true, executive: true, nickname: '승덕', role: 'admin', firm: '대륜', agentAccess: true, membership: 'basic', title: 'Admin', dept: '경영지원본부', branch: '본사', phone: '010-0000-0001', email: 'admin@example.com', joinedAt: '2026-06-15' },
    { id: 'u_staff', nickname: '사무국 직원', role: 'staff', officeId: 'of_seoul', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Staff', dept: '부산총괄본부', branch: '부산총괄본부', phone: '010-0000-0002', email: 'staff@example.com', joinedAt: '2025-03-02' },
    { id: 'u_lawyer', nickname: '샘플 변호사 A', role: 'lawyer', officeId: 'of_seoul', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Partner Attorney', dept: '부산총괄본부', branch: '부산총괄본부', phone: '010-0000-0003', email: 'lawyer@example.com', joinedAt: '2020-09-01' },
    { id: 'u_client', nickname: '하늘', role: 'client', agentAccess: false, membership: 'basic' },
    { id: 'u_admin2', nickname: '운영 어드민', role: 'admin', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Admin', dept: '경영지원본부', branch: '본사', phone: '010-0000-0007', email: 'subadmin@example.com', joinedAt: '2026-09-01' },
    // 조직도 확인용 샘플 구성원 (로그인 계정 없음)
    { id: 'u_l2', presence: 'court', nickname: '샘플 변호사 B', role: 'lawyer', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Junior Associate Attorney', dept: '실무수습변호사', branch: '서울강남', phone: '010-0000-0004', email: 'lawyer-b@example.com', joinedAt: '2026-06-15' },
    { id: 'u_l3', nickname: '샘플 변호사 C', role: 'lawyer', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Junior Associate Attorney', dept: '실무수습변호사', branch: '군산', phone: '010-0000-0005', email: 'lawyer-c@example.com', joinedAt: '2026-06-15' },
    { id: 'u_m1', presence: 'meeting', nickname: '샘플 매니저', role: 'staff', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Manager', dept: '부산총괄본부', branch: '부산총괄본부', phone: '010-0000-0006', email: 'manager@example.com', joinedAt: '2024-01-08' },
  ];
  // 개발용 계정 (서버 연결 시 백오피스에서 실제 계정으로 교체)
  const accounts: Account[] = [
    { userId: 'u_admin', loginId: 'admin', password: 'admin1234', active: true, createdAt: T0 },
    { userId: 'u_staff', loginId: 'staff', password: 'staff1234', active: true, createdAt: T0 },
    { userId: 'u_admin2', loginId: 'subadmin', password: 'subadmin1234', active: true, createdAt: T0 },
    { userId: 'u_lawyer', loginId: 'lawyer', password: 'lawyer1234', active: true, createdAt: T0 },
    { userId: 'u_client', loginId: 'client', password: 'client1234', active: true, createdAt: T0 },
  ];
  const rooms: Room[] = [
    { id: 'r_office', kind: 'office', mode: 'ai', title: '서울 사무소', memberIds: ['u_admin', 'u_staff', 'u_lawyer'], createdBy: 'u_admin', createdAt: T0, officeId: 'of_seoul' },
    { id: 'r_direct', kind: 'direct', mode: 'private', title: '사무국 직원', memberIds: ['u_admin', 'u_staff'], createdBy: 'u_admin', createdAt: T0 },
    { id: 'r_meeting', kind: 'meeting', mode: 'ai', title: '주간 경영회의', memberIds: ['u_admin', 'u_lawyer'], createdBy: 'u_admin', createdAt: T0 },
    { id: 'r_marketing', kind: 'marketing', mode: 'ai', title: '마케팅 작업방', memberIds: ['u_admin'], createdBy: 'u_admin', createdAt: T0 },
    {
      id: 'r_team', kind: 'group', mode: 'private', title: '부산총괄본부 상담팀', memberIds: ['u_admin', 'u_staff', 'u_lawyer', 'u_m1', 'u_l2'], createdBy: 'u_lawyer', createdAt: T0,
      pinnedBy: ['u_lawyer'],
      notices: [{ id: 'nt1', messageId: 'mt1', text: '[리마인드 공지] 상담 변호사는 내방 안내 전화를 상담 전날까지 꼭 해 주세요.', by: 'u_m1', at: ago(50) }],
    },
    // 의뢰인과의 사건방: 변호사·직원에게는 '클라이언트' 탭에만, 의뢰인에게는 대화 탭에 보입니다.
    {
      notices: [{ id: 'nt_h1', messageId: 'mh1', text: '기일 변경\n· 변론기일: 11월 5일(목) 14:30 → 11월 19일(목) 10:00', by: BOT_SENDER, at: ago(0.3) }],
      id: 'r_case1', kind: 'case', mode: 'private', title: '임대차보증금 반환 · 샘플 변호사 A', memberIds: ['u_client', 'u_lawyer'], createdBy: 'u_client', createdAt: ago(30), lawyerId: 'lw_1',
      caseInfo: {
        title: '임대차보증금 반환', field: '부동산·임대차', stage: '진행', caseNo: '2026가단1001',
        deadlines: [
          { id: 'dl1', label: '답변서 제출', date: '2026-10-27', source: 'manual' },
          { id: 'dl2', label: '변론기일', date: '2026-11-19', time: '10:00', place: '예시지방법원 제301호 법정', source: 'daeryuntop' },
        ],
        documents: [{ id: 'dc1', name: '임대차계약서.pdf', addedAt: ago(29) }, { id: 'dc2', name: '내용증명 사본.pdf', addedAt: ago(20) }],
        costs: [], progress: [{ id: 'pg1', at: ago(30), note: '수임' }],
        limits: [
          { id: 'lm1', label: '즉시항고기간', due: kstDay(0), source: 'manual' },
          { id: 'lm2', label: '항소기간', due: kstDay(3), source: 'manual' },
        ],
      },
    },
  ];
  const messages: Message[] = [
    { id: 'm1', roomId: 'r_office', senderId: SYSTEM_SENDER, kind: 'system', text: 'AI 참여방입니다. @AI 로 부르면 AI가 답합니다.', at: T0 },
    { id: 'm2', roomId: 'r_office', senderId: 'u_staff', kind: 'text', text: '내일 오전 기일 서류 준비 완료했습니다.', at: T0 },
    { id: 'm3', roomId: 'r_direct', senderId: SYSTEM_SENDER, kind: 'system', text: '사건수행방입니다. 참여자끼리만 대화하고 AI는 참여하지 않습니다.', at: T0 },
    { id: 'mt1', roomId: 'r_team', senderId: 'u_m1', kind: 'text', text: '[리마인드 공지] 상담 변호사는 내방 안내 전화를 상담 전날까지 꼭 해 주세요.', at: ago(50) },
    { id: 'mt2', roomId: 'r_team', senderId: 'u_lawyer', kind: 'text', text: '@샘플 매니저 @사무국 직원 내일 상담 일정 공유 부탁드립니다.', at: ago(27), mentions: ['u_m1', 'u_staff'], reactions: { u_m1: '👍' } },
    { id: 'mt3', roomId: 'r_team', senderId: 'u_staff', kind: 'text', text: '네, 오전 중에 올리겠습니다.', at: ago(26.9), replyTo: 'mt2' },
    { id: 'mt4', roomId: 'r_team', senderId: 'u_m1', kind: 'text', text: '상담 일정표 링크입니다 https://example.com/schedule', at: ago(1) },
    { id: 'mc1', roomId: 'r_case1', senderId: 'u_client', kind: 'text', text: '변호사님, 집주인에게서 아직 연락이 없습니다.', at: ago(6) },
    { id: 'mh1', roomId: 'r_case1', senderId: BOT_SENDER, kind: 'bot', text: '', at: ago(0.3), hearingAlertId: 'ha1' },
    { id: 'mc2', roomId: 'r_case1', senderId: 'u_lawyer', kind: 'text', text: '네, 이번 주 안에 소장 초안 보내드리겠습니다. 계약서 원본은 보관해 두세요.', at: ago(5.5) },
    { id: 'mt5', roomId: 'r_team', senderId: 'u_l2', kind: 'text', text: '@승덕 대표님 확인 부탁드립니다.', at: ago(0.5), mentions: ['u_admin'] },
  ];
  const s: State = {
    booted: true,
    currentUserId: null,
    users,
    accounts,
    rooms,
    messages,
    meetingNotes: {},
    decisions: [
      { id: 'd1', date: '2026-07-01', topic: '검색광고 이혼 키워드 예산 확대', decision: '이혼 키워드 예산 20% 증액', outcome: '상담 문의 35% 증가', verdict: 'good' },
      { id: 'd2', date: '2026-08-12', topic: '형사 사건 야간 상담 운영', decision: '평일 야간 상담 시범 운영', outcome: '문의는 늘었으나 수임 전환 낮음', verdict: 'bad' },
    ],
    templates: [
      {
        id: 't1', name: '월별 상담 문의 수', chart: 'bar', unit: '건',
        versions: [{ at: '2026-06-30', rows: [{ label: '4월', value: 82 }, { label: '5월', value: 95 }, { label: '6월', value: 110 }] }],
      },
    ],
    programs: [],
    plans: [],
    contents: [
      { id: 'c1', channel: 'homepage', title: '이혼 재산분할 기본 안내', body: '이혼할 때 재산분할은 혼인 기간 동안 함께 모은 재산을 기여도에 따라 나누는 절차입니다.', status: '승인' },
    ],
    budgets: { google_ads: 100000, meta_ads: 80000, naver_searchad: 150000 },
    performance: [
      { channel: 'naver_searchad', topic: '이혼', spend: 1500000, clicks: 900, inquiries: 45 },
      { channel: 'google_ads', topic: '형사', spend: 800000, clicks: 600, inquiries: 12 },
      { channel: 'meta_ads', topic: '상속', spend: 500000, clicks: 1200, inquiries: 18 },
    ],
    lawyerAccounts: { lw_1: 'u_lawyer' },
    posts: [
      {
        id: 'p_notice1', board: 'notice', authorId: 'u_admin', at: ago(1), field: '',
        title: '10월 변호사 정례회의 일정 안내',
        body: '10월 정례회의는 24일(금) 오후 4시 본사 대회의실에서 열립니다. 지점 변호사님은 화상으로 참석해 주세요.',
        votes: {}, comments: [],
      },
      {
        id: 'p_event1', board: 'event', authorId: 'u_l2', at: ago(8), field: '',
        title: '[부고] 예시: 샘플 변호사 C 부친상',
        body: '빈소: 예시 장례식장 3호실 / 발인: 10월 16일 오전 7시. 마음으로 함께해 주시면 감사하겠습니다.',
        votes: {}, comments: [],
      },
      {
        id: 'p_praise1', board: 'praise', authorId: 'u_lawyer', at: ago(26), field: '이혼·가사',
        title: '양육권 사건 종결 후 의뢰인이 남긴 감사 인사',
        body: '진행 상황을 단계마다 사건방으로 알려 드린 점이 가장 안심됐다고 하셨습니다. 기일 전날 알림을 꼭 챙기는 방식이 효과가 있었습니다.',
        votes: { u_l2: 1, u_l3: 1 }, comments: [],
      },
      {
        id: 'p_law_ex1', board: 'lawnews', authorId: LAW_BOT, at: ago(1.5), field: '', sourceId: 'example-precedent-1',
        title: '[판례] 대법원 2026. 10. 13. 2026다000000 (예시) 보증금 반환 지연손해금',
        body: '예시 판결요지입니다. 임대차 종료 후 임차인이 목적물을 인도하지 않은 경우, 보증금 반환 의무의 지체 책임은 임차인의 인도 의무 이행 제공이 있은 때부터 발생한다.',
        votes: {}, comments: [],
      },
      {
        id: 'p_law_ex2', board: 'lawnews', authorId: LAW_BOT, at: ago(1.5), field: '', sourceId: 'example-law-1',
        title: '[법령 개정] 예시법 일부개정법률',
        body: '예시 개정 요지입니다. 신고 기한을 30일에서 60일로 늘리고, 기한을 넘긴 경우의 과태료 기준을 정비함.',
        votes: {}, comments: [],
      },
      {
        id: 'p_sky1', board: 'skyzai', notice: true, authorId: 'u_admin', at: ago(6), field: '',
        title: 'SKYZAI 게시판 이용 안내',
        body: 'SKYZAI 관련 아이디어와 사용 후기를 자유롭게 올려 주세요. 공지는 어드민이 올립니다.',
        votes: {}, comments: [],
      },
      {
        id: 'p_sky2', board: 'skyzai', authorId: 'u_lawyer', at: ago(4), field: '',
        title: '판례 요약 기능 써 본 후기',
        body: '긴 판결문도 쟁점별로 나눠 줘서 서면 준비 시간이 줄었습니다.',
        votes: { u_l2: 1 }, comments: [],
      },
      {
        id: 'p_adv1', board: 'advice', authorId: 'u_l3', at: ago(5), field: '부동산·임대차',
        title: '임차권등기명령 후 보증금 반환 소송, 지연손해금 기산점 의견 구합니다',
        body: '임대차 종료 다음 날부터로 청구하려는데, 실무상 다른 기준으로 판단된 사례가 있으면 공유 부탁드립니다.',
        votes: {}, comments: [{ id: 'ca1', authorId: 'u_lawyer', text: '종료 다음 날부터 청구하되, 동시이행 항변이 들어오면 인도일 기준으로 다툼이 생길 수 있습니다.', at: ago(3), votes: {} }],
      },
      {
        id: 'p_law1', board: 'lawyer', authorId: 'u_l2', at: ago(2), field: '기타 형사범죄',
        title: '보석 심문 기일 잡힌 뒤 준비 서류 공유 부탁드립니다',
        body: '첫 보석 사건이라 심문 기일 전에 어떤 소명자료를 더 내시는지 궁금합니다. 경험 있으신 분들 의견 부탁드립니다.',
        votes: { u_lawyer: 1 },
        comments: [{ id: 'cl1', authorId: 'u_lawyer', text: '가족 탄원서와 주거 확인 자료는 꼭 챙기세요. 출석 담보 계획도 정리해 두면 좋습니다.', at: ago(1), votes: {} }],
      },
      {
        id: 'p1', authorId: 'u_client', at: ago(3), field: '부동산·임대차',
        title: '전세 보증금을 못 돌려받고 있어요',
        body: '계약 만료가 지났는데 집주인이 새 세입자가 들어와야 준다고 합니다. 이사는 가야 하는데 어떻게 해야 하나요?',
        votes: { u_staff: 1, u_admin: 1 },
        comments: [
          { id: 'pc1', authorId: 'u_lawyer', at: ago(2), votes: { u_client: 1 }, text: '이사 전에 임차권등기명령부터 신청해 두세요. 그래야 이사 후에도 대항력과 우선변제권이 유지됩니다.' },
          { id: 'pc2', authorId: 'u_client', parentId: 'pc1', at: ago(1), votes: {}, text: '등기 나오기 전에 이사하면 안 되는 거죠?' },
        ],
      },
      {
        id: 'p2', authorId: 'u_staff', at: ago(20), field: '명예훼손·모욕',
        title: '단톡방에서 저를 저격하는 글이 올라왔습니다',
        body: '실명은 없지만 누가 봐도 저라는 걸 알 수 있게 썼어요. 이것도 명예훼손이 되나요?',
        votes: { u_client: 1 },
        comments: [],
      },
      {
        id: 'p3', authorId: 'u_lawyer', at: ago(48), field: '이혼·가사',
        title: '협의이혼 전에 꼭 정리해 둘 세 가지',
        body: '양육권과 양육비, 재산분할 목록, 위자료 여부입니다. 이혼 숙려기간 동안 이 세 가지를 서면으로 남겨 두면 나중에 다툼이 크게 줄어듭니다.',
        votes: Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`seed_${i}`, 1 as const])),
        comments: [],
      },
    ],
    notes: [],
    noticeSeen: {},
    hearingAlerts: [
      {
        id: 'ha1', roomId: 'r_case1', hearingId: 'dl2', change: 'changed', label: '변론기일', date: '2026-11-19', time: '10:00', place: '예시지방법원 제301호 법정',
        prevDate: '2026-11-05', prevTime: '14:30', source: 'daeryuntop', at: ago(0.3), messageId: 'mh1', recipients: ['u_client', 'u_lawyer'], ackedBy: {},
      },
    ],
    authCodes: [
      { id: 'ac1', userId: 'u_lawyer', code: '402917', at: ago(5), expiresAt: ago(5 - AUTH_TTL_MIN / 60), read: true },
      { id: 'ac2', userId: 'u_lawyer', code: '815360', at: ago(0.005), expiresAt: ago(0.005 - AUTH_TTL_MIN / 60) },
    ],
    suggestions: [
      { id: 'sg1', authorId: 'u_lawyer', body: '사건방 파일을 날짜별로 모아 보는 기능이 있으면 좋겠습니다.', at: ago(20), status: 'review', answer: '서버 연결 때 파일 모아보기와 함께 넣겠습니다.', answeredAt: ago(5) },
      { id: 'sg2', authorId: 'u_client', body: '진행 상황 알림을 카카오톡으로도 받고 싶어요.', at: ago(3), status: 'open' },
    ],
    reports: [{ id: 'rp1', postId: 'p2', reporterId: 'u_lawyer', reason: '개인정보 노출', at: ago(1), status: 'open' }],
    boardBans: {},
    reads: { r_team: { u_lawyer: ago(26.95), u_staff: ago(26.9), u_m1: ago(1), u_l2: ago(0.5), u_admin: ago(28) } },
    favorites: { u_lawyer: ['u_staff'], u_admin: ['u_lawyer'] },
    openRooms: [
      {
        id: 'o1', title: '이혼 소송 경험 나눠요', description: '실제 겪은 일만 편하게 나눠요. 실명·연락처 공유 금지.', tags: ['이혼', '양육권'], hostId: 'u_staff', max: 100, createdAt: ago(40), banned: [],
        members: [{ userId: 'u_staff', alias: '새벽별', joinedAt: ago(40) }, { userId: 'u_l2', alias: '지나가는법조인', joinedAt: ago(10) }],
      },
      {
        id: 'o2', title: '개업 변호사 정보방', description: '사무실 운영, 수임, 세무 이야기', tags: ['개업', '사무실'], hostId: 'u_l3', max: 300, password: 'law2026', createdAt: ago(80), banned: [],
        members: [{ userId: 'u_l3', alias: '군산댁', joinedAt: ago(80) }],
      },
    ],
    openMessages: [
      { id: 'om1', roomId: 'o1', senderId: 'u_staff', text: '양육권 다툼 있으셨던 분 계신가요?', at: ago(9) },
      { id: 'om2', roomId: 'o1', senderId: 'u_l2', text: '일반론으로는 주 양육자가 누구였는지가 가장 크게 봅니다. 구체적인 건 상담 받아 보세요.', at: ago(8) },
      { id: 'om3', roomId: 'o2', senderId: 'u_l3', text: '부가세 신고 다들 직접 하시나요?', at: ago(20) },
    ],
  };
  // 만료일이 된 예시 불변기간의 경고 글
  return { ...s, posts: [...dueLimitPosts(s.rooms, s.users, s.posts), ...s.posts] };
}

/** 서버 연결 시 처음 상태: 서버에서 받을 데이터는 비우고, 아직 서버가 없는 업무 도구 예시만 남깁니다. */
function serverState(): State {
  return {
    ...initialState(),
    booted: false, syncError: undefined, currentUserId: null, users: [], accounts: [], rooms: [], messages: [], lawyerAccounts: {},
    posts: [], notes: [], reports: [], boardBans: {}, reads: {}, favorites: {}, openRooms: [], openMessages: [],
    noticeSeen: {}, suggestions: [], authCodes: [], hearingAlerts: [],
  };
}

// ---- 구독 ----
const remote: Remote | null = supabase ? remoteOps(supabase) : null;
if (remote) useServerIds(true);
let state = remote ? serverState() : initialState();
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

export function resetState() {
  state = remote ? { ...serverState(), booted: true } : initialState();
  listeners.forEach((l) => l());
}

// ---- 서버 동기화 ----
// 동작은 화면에 먼저 반영하고(빠른 반응), 같은 변경을 순서대로 서버에 보냅니다.
// 서버가 거절하면 사유를 띄우고 서버의 최신 상태로 다시 불러옵니다.
let queue: Promise<void> = Promise.resolve();
let changes = 0;
let quiet = 0;

function mirror(op: (r: Remote) => Promise<unknown>) {
  if (!remote || quiet) return;
  changes += 1;
  queue = queue.then(() => op(remote)).then(
    () => undefined,
    (e) => {
      // 처음 실패한 사유를 보여 줍니다 (뒤따른 변경은 대개 같은 이유로 함께 실패).
      set({ syncError: state.syncError ?? reasonOf(e, '서버에 저장하지 못했습니다. 최신 상태로 다시 불러왔습니다.') });
      void refresh(true);
    },
  );
}

/** 서버 함수가 스스로 만드는 메시지 등, 서버로 따로 보내지 않을 변경 */
function silently<T>(fn: () => T): T {
  quiet += 1;
  try {
    return fn();
  } finally {
    quiet -= 1;
  }
}

// 바뀐 것만 받기: 메시지는 처음 들어올 때 한 번 전부 받고, 그 뒤로는 실시간으로 온 한 줄씩, 또는 마지막으로 받은 시각 뒤의 것만 받습니다.
let syncedAt: string | undefined;
const later = (a: string | undefined, b: string | undefined) => (!a ? b : !b ? a : a > b ? a : b);

/** 받은 메시지들을 지금 목록에 합칩니다 (같은 id는 바꾸고, 새것은 시간 순서로 끼움) */
function mergeMessages(cur: Message[], incoming: Message[]): Message[] {
  if (!incoming.length) return cur;
  const byId = new Map(incoming.map((m) => [m.id, m]));
  const out = cur.map((m) => byId.get(m.id) ?? m);
  const seen = new Set(cur.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  if (!fresh.length) return out;
  return [...out, ...fresh].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/**
 * 서버의 최신 상태로 맞춥니다. 보내는 중인 변경이 끝난 뒤 받고, 그사이 새 변경이 생기면 다시 받습니다.
 * full이면 메시지까지 전부 다시 받고(저장 실패 뒤), 아니면 메시지는 바뀐 것만 받습니다.
 */
export async function refresh(full = false): Promise<void> {
  if (!supabase) return;
  for (let tries = 0; tries < 3; tries++) {
    const meId = state.currentUserId;
    if (!meId) return;
    await queue;
    const seen = changes;
    try {
      if (full || !syncedAt) {
        const snap = await loadAll(supabase, meId);
        if (changes !== seen || state.currentUserId !== meId) continue;
        syncedAt = snap.syncedAt ?? syncedAt;
        set(snap);
        return;
      }
      const [base, delta] = await Promise.all([loadAll(supabase, meId, false), loadMessagesSince(supabase, meId, syncedAt)]);
      if (changes !== seen || state.currentUserId !== meId) continue;
      syncedAt = later(syncedAt, delta.syncedAt);
      const reactionsBy = new Map<string, Record<string, string>>();
      for (const r of delta.reactions) reactionsBy.set(r.message_id, { ...reactionsBy.get(r.message_id), [r.user_id]: r.emoji });
      const hidden = new Set(delta.hides.map((h) => h.message_id));
      const { messages: _skip, ...rest } = base;
      void _skip;
      set((s) => ({
        ...rest,
        messages: mergeMessages(s.messages, delta.messages).map((m) => {
          const rs = reactionsBy.get(m.id);
          const { reactions: _r, deletedFor: _d, ...plain } = m;
          void _r;
          void _d;
          return { ...plain, ...(rs ? { reactions: rs } : {}), ...(hidden.has(m.id) ? { deletedFor: [meId] } : {}) };
        }),
      }));
      return;
    } catch {
      return; // 연결이 끊기면 다음 새로고침에서 다시
    }
  }
}

// 실시간: 이 표들이 바뀌면 서버가 바로 알려 줍니다 (내가 볼 수 있는 행만).
// 메시지·공감·숨김·읽음은 온 한 줄만 화면에 반영하고, 드문 변경(방·사건·기일 등)은 메시지를 뺀 나머지를 다시 받습니다.
const LIVE_TABLES = ['room_notices', 'rooms', 'cases', 'hearings', 'case_deadlines', 'case_progress', 'hearing_alerts', 'hearing_alert_recipients'];
let live: RealtimeChannel | null = null;
let liveTimer: ReturnType<typeof setTimeout> | undefined;
let liveStarting = false;

async function goLive() {
  if (!supabase || live || liveStarting) return;
  liveStarting = true;
  try {
    await startLive(supabase);
  } finally {
    liveStarting = false;
  }
}

type Change = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, any>; old: Record<string, any> };

function patchMessage(id: string, fn: (m: Message) => Message) {
  if (state.messages.some((m) => m.id === id)) updateMessage(id, fn);
}

async function onMessageRow(sb: SupabaseClient, c: Change) {
  const meId = state.currentUserId;
  if (!meId) return;
  if (c.eventType === 'DELETE') {
    set((s) => ({ messages: s.messages.filter((m) => m.id !== c.old.id) }));
    return;
  }
  const row = c.new;
  syncedAt = later(syncedAt, row.updated_at);
  const prev = state.messages.find((m) => m.id === row.id);
  const [m] = await messagesFromRows(sb, meId, [row], () => undefined, () => !!prev?.deletedFor?.includes(meId));
  const merged: Message = { ...m, ...(prev?.reactions && !m.recalled ? { reactions: prev.reactions } : {}) };
  set((s) => ({ messages: mergeMessages(s.messages, [merged]) }));
}

function onReactionRow(c: Change) {
  const r = c.eventType === 'DELETE' ? c.old : c.new;
  if (!r.message_id || !r.user_id) return;
  patchMessage(r.message_id, (m) => {
    const next = { ...m.reactions };
    if (c.eventType === 'DELETE') delete next[r.user_id];
    else next[r.user_id] = r.emoji;
    return { ...m, reactions: next };
  });
}

function onHideRow(c: Change) {
  const r = c.eventType === 'DELETE' ? c.old : c.new;
  const meId = state.currentUserId;
  if (!r.message_id || !meId || (r.user_id && r.user_id !== meId)) return;
  patchMessage(r.message_id, (m) => (c.eventType === 'DELETE' ? { ...m, deletedFor: undefined } : { ...m, deletedFor: [meId] }));
}

/** 읽음·고정·알림 설정 등 참여 정보가 바뀐 것은 그 방에만 반영 (드나듦은 다시 받기) */
function onMemberRow(c: Change, kick: () => void) {
  if (c.eventType !== 'UPDATE') return kick();
  const m = c.new;
  const toggle = (ids: string[] | undefined, on: boolean) => (on ? [...new Set([...(ids ?? []), m.user_id])] : (ids ?? []).filter((x) => x !== m.user_id));
  set((s) => ({
    reads: m.last_read_at ? { ...s.reads, [m.room_id]: { ...s.reads[m.room_id], [m.user_id]: m.last_read_at } } : s.reads,
    rooms: s.rooms.map((r) => {
      if (r.id !== m.room_id) return r;
      const notify = { ...r.notify };
      if (m.notify === 'all') delete notify[m.user_id];
      else notify[m.user_id] = m.notify;
      const hiddenAt = { ...r.hiddenAt };
      if (m.hidden_at) hiddenAt[m.user_id] = m.hidden_at;
      else delete hiddenAt[m.user_id];
      return {
        ...r,
        masters: toggle(r.masters, m.is_master),
        pinnedBy: toggle(r.pinnedBy, m.pinned),
        noticeHiddenBy: toggle(r.noticeHiddenBy, m.notice_hidden),
        notify,
        hiddenAt,
      };
    }),
  }));
}

async function startLive(sb: SupabaseClient) {
  // 실시간 연결에도 로그인 표를 넘겨야 행 보안(내 방만)이 적용된 알림이 옵니다
  const token = (await sb.auth.getSession()).data.session?.access_token;
  if (!token || live) return;
  await sb.realtime.setAuth(token);
  const ch = sb.channel('rightnow-live');
  const kick = () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => void refresh(), 300);
  };
  const on = (table: string, fn: (c: Change) => void) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => fn(p as unknown as Change));
  on('messages', (c) => void onMessageRow(sb, c).catch(kick));
  on('message_reactions', onReactionRow);
  on('message_hides', onHideRow);
  on('room_members', (c) => onMemberRow(c, kick));
  for (const table of LIVE_TABLES) on(table, kick);
  live = ch.subscribe((status) => {
    // 처음 붙거나 끊겼다 다시 붙으면 그사이 놓친 것만 받습니다
    if (status === 'SUBSCRIBED') kick();
  });
}

function stopLive() {
  clearTimeout(liveTimer);
  if (supabase && live) void supabase.removeChannel(live);
  live = null;
}

/** 로그인한 계정으로 들어가기: 중지 계정 확인, 데이터 받기 */
async function enter(userId: string): Promise<void> {
  const active = await remote!.touchLogin();
  if (!active) throw new Error('사용이 중지된 계정입니다. 관리자에게 문의하세요.');
  const snap = await loadAll(supabase!, userId);
  if (!snap.users.some((u) => u.id === userId)) throw new Error('계정 정보를 찾을 수 없습니다. 관리자에게 문의하세요.');
  syncedAt = snap.syncedAt;
  set({ ...snap, currentUserId: userId, syncError: undefined });
  void goLive();
}

let started = false;
let signingOut: Promise<void> = Promise.resolve();
const signOutHooks: (() => Promise<void>)[] = [];
const beforeSignOut = () => Promise.all(signOutHooks.map((fn) => fn().catch(() => undefined))).then(() => undefined);

/** 로그아웃 직전에 할 일 (폰·PC 알림 주소 해제). 로그인이 살아 있을 때 불립니다. */
export function onBeforeSignOut(fn: () => Promise<void>): void {
  signOutHooks.push(fn);
}

/** 앱을 열 때 한 번: 저장된 로그인이 있으면 이어서 들어가고, 주기적으로 새로 받습니다. */
export async function startServer(): Promise<void> {
  if (!supabase || started) return;
  started = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) await enter(data.session.user.id).catch(() => supabase!.auth.signOut());
  } finally {
    set({ booted: true });
  }
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') stopLive();
    if (event === 'SIGNED_OUT' && state.currentUserId) set({ ...serverState(), booted: true });
  });
  // 실시간 대상이 아닌 것(게시판·쪽지 등)은 3분마다, 그리고 앱으로 돌아올 때 받습니다. 메시지는 이때도 바뀐 것만 받습니다.
  setInterval(() => void refresh(), 180_000);
  AppState.addEventListener('change', (st) => {
    if (st === 'active') void refresh();
  });
}

/** 보내는 중인 변경이 모두 끝날 때까지 (시험용) */
export function settled(): Promise<void> {
  return queue;
}

export function clearSyncError() {
  set({ syncError: undefined });
}

/** 로그인한 사용자. 로그인 화면을 지난 뒤에만 부릅니다. */
export function me(s: State = state): User {
  const u = s.users.find((x) => x.id === s.currentUserId);
  if (!u) throw new Error('로그인이 필요합니다');
  return u;
}

export function loggedIn(s: State = state): boolean {
  return s.users.some((x) => x.id === s.currentUserId);
}

/** 관리자어드민 계정은 관리자어드민만 손댈 수 있습니다 (일반 어드민의 권한 우회 방지). */
function superGuard(userId: string): RoomCheck | undefined {
  const target = userById(userId);
  if (target?.superAdmin && target.role === 'admin' && !canManageOpen(me())) return { ok: false, reason: '관리자어드민 계정은 관리자어드민만 바꿀 수 있습니다.' };
  return undefined;
}

/** 변호사 게시판 글은 변호사만 읽고 쓸 수 있습니다. */
function boardDenied(postId: string): RoomCheck | undefined {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || !canSeeBoard(me(), boardOf(post))) return { ok: false, reason: '글을 찾을 수 없습니다.' };
  return undefined;
}

/** 게시판 이용 제한 중이면 거절 사유 */
function boardBlocked(): RoomCheck | undefined {
  const until = restrictedUntil(state.boardBans, me().id);
  return until ? { ok: false, reason: `게시판 이용이 제한되었습니다. (${formatUntil(until)}까지)` } : undefined;
}

function closeReports(reports: BoardReport[], match: (r: BoardReport) => boolean, resolution: string): BoardReport[] {
  return reports.map((r) => (r.status === 'open' && match(r) ? { ...r, status: 'resolved' as const, resolution } : r));
}

const PRIVATE_CASE_NOTE = '사건수행방입니다. AI는 대화에 참여하지 않고, 사건 진행·배당 알림과 절차 안내만 전해 드립니다.';

function updateOpen(roomId: string, fn: (r: OpenRoom) => OpenRoom) {
  set((s) => ({ openRooms: s.openRooms.map((r) => (r.id === roomId ? fn(r) : r)) }));
}

function pushOpen(roomId: string, senderId: string, text: string, system = false) {
  const m: OpenMessage = { id: newId('om'), roomId, senderId, text, at: nowIso(), ...(system ? { system } : {}) };
  set((s) => ({ openMessages: [...s.openMessages, m] }));
  return m;
}

function userById(id: string) {
  return state.users.find((u) => u.id === id);
}

function pushMessage(roomId: string, senderId: string, kind: Message['kind'], text: string, extra: Partial<Message> = {}) {
  const msg: Message = { id: newId('m'), roomId, senderId, kind, text, at: nowIso(), ...extra };
  set((s) => ({ messages: [...s.messages, msg] }));
  if (senderId !== SYSTEM_SENDER && senderId !== AI_SENDER && senderId !== BOT_SENDER) markReadAt(roomId, senderId, msg.at);
  mirror((r) => r.postMessage(msg));
  return msg;
}

function markReadAt(roomId: string, userId: string, at: string) {
  if ((state.reads[roomId]?.[userId] ?? '') >= at) return;
  set((s) => ({ reads: { ...s.reads, [roomId]: { ...s.reads[roomId], [userId]: at } } }));
}

function updateMessage(id: string, fn: (m: Message) => Message) {
  set((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }));
}

function updateRoom(roomId: string, fn: (r: Room) => Room) {
  set((s) => ({ rooms: s.rooms.map((r) => (r.id === roomId ? fn(r) : r)) }));
}

function updateLimits(roomId: string, fn: (ls: FixedDeadline[]) => FixedDeadline[]) {
  updateRoom(roomId, (r) => (r.caseInfo ? { ...r, caseInfo: { ...r.caseInfo, limits: fn(r.caseInfo.limits ?? []) } } : r));
}

function limitLawyerIds(room: Room): string[] {
  return state.users.filter((u) => u.role === 'lawyer' && room.memberIds.includes(u.id)).map((u) => u.id);
}

/** 서버 없이 쓸 때: 만료일이 된 불변기간 경고 글을 기기 안에서 올립니다 (서버에서는 1분마다 서버가 올림). */
function checkLimitsLocally() {
  if (remote) return;
  const fresh = dueLimitPosts(state.rooms, state.users, state.posts);
  if (fresh.length) set((s) => ({ posts: [...fresh, ...s.posts] }));
}

/**
 * 서버 없이 쓸 때: 대륜탑 기일 한 줄을 받습니다 (서버에서는 ingest_daeryuntop_hearing이 같은 규칙으로 처리).
 * 결과: new / changed / cancelled / deadline / same / skip:이유
 */
function ingestLocal(h: DtHearing): string {
  const plan = classify(h);
  if (plan.kind === 'skip') return `skip:${plan.reason}`;
  const room = state.rooms.find((r) => r.caseInfo?.caseNo && r.caseInfo.caseNo === h.caseNo?.trim());
  if (!room?.caseInfo) return 'skip:연결 안 된 사건';
  const setHearings = (fn: (hs: Hearing[]) => Hearing[]) => updateRoom(room.id, (r) => (r.caseInfo ? { ...r, caseInfo: { ...r.caseInfo, deadlines: fn(r.caseInfo.deadlines) } } : r));
  if (plan.kind === 'deadline') {
    if (plan.cancelled) {
      updateLimits(room.id, (ls) => ls.filter((d) => d.externalId !== h.id));
      return 'cancelled';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date)) return 'skip:날짜 없음';
    const old = room.caseInfo.limits?.find((d) => d.externalId === h.id);
    const handledAt = plan.handled ? (old?.handledAt ?? nowIso()) : undefined;
    const d: FixedDeadline = { ...old, id: old?.id ?? newId('lm'), label: (h.name.trim() || '불변기간').slice(0, 60), due: h.date, source: 'daeryuntop', externalId: h.id, handledAt };
    if (!handledAt) delete d.handledAt;
    updateLimits(room.id, (ls) => [...ls.filter((x) => x.id !== d.id), d].sort((a, b) => a.due.localeCompare(b.due)));
    setHearings((hs) => hs.filter((x) => x.externalId !== h.id));
    checkLimitsLocally();
    return 'deadline';
  }
  const today = kstDay(0);
  let prev = room.caseInfo.deadlines.find((x) => x.externalId === h.id);
  // 엑셀은 기일 번호가 없어, 같은 이름의 다가오는 기일이 있으면 날짜가 바뀐 것으로 봅니다
  if (!prev && h.id.startsWith('xl:')) {
    prev = room.caseInfo.deadlines
      .filter((x) => x.source === 'daeryuntop' && x.externalId?.startsWith('xl:') && x.date >= today && x.label.replace(/ \[엄수\]$/, '') === h.name.trim())
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }
  const tag = (id: string) => setHearings((hs) => hs.map((x) => (x.id === id ? { ...x, externalId: h.id, ...(plan.strict ? { strict: true } : {}), ...(plan.firmOnly ? { firmOnly: true } : {}) } : x)));
  if (plan.cancelled) {
    if (!prev) return 'skip:없는 기일 취소';
    if (prev.firmOnly) setHearings((hs) => hs.filter((x) => x.id !== prev!.id));
    else actions.syncHearing(room.id, { hearingId: prev.id, change: 'cancelled', label: `${prev.label} (${plan.cancelled})`, date: prev.date, time: prev.time, place: prev.place }, 'daeryuntop');
    return 'cancelled';
  }
  if (plan.done) {
    if (prev) tag(prev.id);
    return 'skip:완료된 기일';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date)) return 'skip:날짜 없음';
  const next = { label: plan.label, date: h.date, time: plan.time, place: plan.place };
  if (!prev) {
    if (h.date < today) return 'skip:지난 기일';
    if (plan.firmOnly) {
      setHearings((hs) => [...hs, { id: newId('dl'), ...next, source: 'daeryuntop', externalId: h.id, firmOnly: true, ...(plan.strict ? { strict: true } : {}) }]);
      return 'new';
    }
    const r = actions.syncHearing(room.id, { change: 'new', ...next }, 'daeryuntop');
    if (!r.ok) return `skip:${r.reason}`;
    const hid = state.hearingAlerts.find((a) => a.id === r.alertId)?.hearingId;
    if (hid) tag(hid);
    return 'new';
  }
  tag(prev.id);
  if (prev.label === next.label && prev.date === next.date && prev.time === next.time && prev.place === next.place) return 'same';
  if (prev.firmOnly) setHearings((hs) => hs.map((x) => (x.id === prev!.id ? { ...x, ...next } : x)));
  else {
    const r = actions.syncHearing(room.id, { hearingId: prev.id, change: 'changed', ...next }, 'daeryuntop');
    if (!r.ok) return `skip:${r.reason}`;
    tag(prev.id); // 기일을 새로 만들며 대륜탑 번호가 빠지므로 다시 붙임
  }
  return 'changed';
}

/** 어드민 화면의 사건별 불변기간: 서버에서 받은 목록, 없으면 기기 안 사건방에서 */
export function deadlineCases(s: State): DeadlineCase[] {
  return s.deadlineCases ?? deadlineCasesFrom(s.rooms, s.users);
}

/** 이 방에서 마지막 회의 정리 이후 사람들이 나눈 대화를 회의록으로 만듭니다. */
function roomTranscript(roomId: string): string {
  const msgs = state.messages.filter((m) => m.roomId === roomId);
  let start = 0;
  msgs.forEach((m, i) => {
    if (m.kind === 'ai' && m.text.startsWith('회의 정리')) start = i + 1;
  });
  return msgs
    .slice(start)
    .filter((m) => m.kind === 'text' && !/@ai\b/i.test(m.text))
    .map((m) => `${userById(m.senderId)?.nickname ?? m.senderId}: ${m.text}`)
    .join('\n');
}

function planText(p: Plan): string {
  return [
    `마케팅 계획 (${p.status})`,
    ...p.steps.map((st) => `· ${st.kind === 'budget' ? `${CHANNEL_LABEL[st.channel]} 예산 ${st.changePct > 0 ? '+' : ''}${st.changePct}%` : `${CHANNEL_LABEL[st.channel]} '${st.topic}' 콘텐츠 ${st.count}건`}`),
    ...p.warnings.map((w) => `⚠ ${w}`),
    ...(p.status === '승인 대기' && p.steps.length ? ['"@AI 승인" 또는 "@AI 반려"로 답해 주세요.'] : []),
  ].join('\n');
}

function runCommand(roomId: string, cmd: AiCommand): string {
  switch (cmd.kind) {
    case 'help':
      return AI_HELP;
    case 'meeting': {
      const transcript = cmd.arg || roomTranscript(roomId);
      if (!transcript.trim()) return '정리할 대화가 없습니다.';
      const notes = summarizeMeeting(transcript);
      set((s) => ({ meetingNotes: { ...s.meetingNotes, [roomId]: notes } }));
      const today = nowIso().slice(0, 10);
      const records = notes.decisions.map((d) => ({ id: newId('d'), date: today, topic: d.slice(0, 30), decision: d }));
      set((s) => ({ decisions: [...records, ...s.decisions] }));
      return meetingText(notes);
    }
    case 'opinion': {
      if (!cmd.arg) return '안건을 함께 적어 주세요. 예: @AI 의견 검색광고 예산 늘리기';
      const op = opinionFor(state.decisions, cmd.arg);
      return [`의견: ${op.stance}`, ...op.reasons.map((r) => `· ${r}`)].join('\n');
    }
    case 'program': {
      if (!cmd.arg) return '만들 도구를 설명해 주세요. 예: @AI 프로그램 기일표 만들어주는 도구';
      actions.requestProgram(cmd.arg);
      return `프로그램 요청을 받았습니다: ${titleFrom(cmd.arg)} (${getAi().connected ? '생성 중' : 'AI 연결 대기'})`;
    }
    case 'image': {
      const [first, ...rest] = cmd.arg.split('\n');
      const t =
        state.templates
          .map((x) => ({ x, score: similarity(first, x.name) }))
          .sort((a, b) => b.score - a.score)[0]?.x ?? state.templates[0];
      if (!t) return '저장된 자료가 없습니다.';
      const rows = parseRows(rest.join('\n'));
      if (rows.length) actions.refreshTemplate(t.id, rows);
      const cur = latest(state.templates.find((x) => x.id === t.id)!);
      return [`${t.name} (${cur.at}${rows.length ? ', 최신 데이터로 다시 만듦' : ''})`, ...cur.rows.map((r) => `· ${r.label} ${r.value}${t.unit}`)].join('\n');
    }
    case 'marketing': {
      if (!cmd.arg) return '지시를 함께 적어 주세요. 예: @AI 마케팅 홈페이지 이혼 콘텐츠 5건, 구글 예산 20% 증액';
      return planText(actions.planCommand(cmd.arg));
    }
    case 'approve':
    case 'reject': {
      const p = state.plans.find((x) => x.status === '승인 대기');
      if (!p) return '승인을 기다리는 마케팅 계획이 없습니다.';
      if (cmd.kind === 'reject') {
        actions.rejectPlan(p.id);
        return '계획을 반려했습니다.';
      }
      const r = actions.approvePlan(p.id);
      return r.ok ? planText(state.plans.find((x) => x.id === p.id)!) : r.reason;
    }
    case 'check': {
      if (!cmd.arg) return '점검할 원고를 함께 붙여 넣어 주세요.';
      const issues = checkCompliance(cmd.arg);
      const sim = mostSimilar(cmd.arg, state.contents);
      return [
        '광고 규정 점검',
        ...(issues.length ? issues.map((i) => `· "${i.phrase}" — ${i.reason}`) : ['· 문제 표현 없음']),
        sim ? `유사도: "${sim.item.title}"와 ${Math.round(sim.score * 100)}%${sim.score > 0.5 ? ' (중복 위험)' : ''}` : '',
      ].filter(Boolean).join('\n');
    }
    case 'performance':
      return ['성과 (문의 전환율 순)', ...rankPerformance(state.performance).map((r, i) => `${i + 1}. ${CHANNEL_LABEL[r.channel]} · ${r.topic} — 전환율 ${(r.rate * 100).toFixed(1)}%, 문의 ${r.inquiries}건`)].join('\n');
    default:
      return '';
  }
}

function meetingText(notes: MeetingNotes): string {
  return [
    '회의 정리',
    ...notes.summary.map((x) => `· ${x}`),
    ...(notes.decisions.length ? ['결정사항', ...notes.decisions.map((d) => `· ${d}`)] : []),
    ...(notes.actions.length ? ['할 일', ...notes.actions.map((a) => `· ${a.owner ? `[${a.owner}] ` : ''}${a.task}${a.due ? ` (${a.due})` : ''}`)] : []),
  ].join('\n');
}

// ---- 사용자 ----
export const actions = {
  // ---- 로그인 ----
  login(loginId: string, password: string): RoomCheck {
    const acc = state.accounts.find((a) => a.loginId === loginId.trim());
    if (!acc || acc.password !== password) return { ok: false, reason: '아이디 또는 비밀번호가 맞지 않습니다.' };
    if (!acc.active) return { ok: false, reason: '사용이 중지된 계정입니다. 관리자에게 문의하세요.' };
    const at = nowIso();
    set((s) => ({ currentUserId: acc.userId, accounts: s.accounts.map((a) => (a.userId === acc.userId ? { ...a, lastLoginAt: at } : a)) }));
    return { ok: true };
  },

  /** 로그인 화면: 서버가 있으면 서버 계정으로, 없으면 기기 안 개발용 계정으로 */
  async signIn(loginId: string, password: string): Promise<RoomCheck> {
    if (!supabase) return actions.login(loginId, password);
    await signingOut;
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail(loginId), password });
    if (error || !data.user) return { ok: false, reason: reasonOf(error) };
    try {
      await enter(data.user.id);
      return { ok: true };
    } catch (e) {
      await supabase.auth.signOut();
      return { ok: false, reason: reasonOf(e as Error) };
    }
  },

  logout() {
    if (supabase) {
      // 보내는 중인 변경을 마친 뒤 로그아웃합니다.
      stopLive();
      signingOut = queue
        .then(() => beforeSignOut().catch(() => undefined))
        .then(() => supabase!.auth.signOut())
        .then(() => undefined, () => undefined);
      set({ ...serverState(), booted: true });
      return;
    }
    set({ currentUserId: null });
  },

  // ---- 백오피스: 계정 관리 (어드민 전용) ----
  createAccount(input: { loginId: string; password: string; nickname: string; role: Role; officeId?: string; firm?: string }): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 계정을 만들 수 있습니다.' };
    const loginId = input.loginId.trim();
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(loginId)) return { ok: false, reason: '아이디는 영문·숫자 3~30자로 정해 주세요.' };
    if (state.accounts.some((a) => a.loginId === loginId)) return { ok: false, reason: '이미 쓰는 아이디입니다.' };
    if (input.password.length < 8) return { ok: false, reason: '비밀번호는 8자 이상이어야 합니다.' };
    if (!input.nickname.trim()) return { ok: false, reason: '이름을 입력해 주세요.' };
    const user: User = { id: newId('u'), nickname: input.nickname.trim(), role: input.role, officeId: input.officeId, firm: input.role === 'client' ? undefined : input.firm?.trim() || '대륜', agentAccess: false, membership: 'basic' };
    const acc: Account = { userId: user.id, loginId, password: input.password, active: true, createdAt: nowIso() };
    set((s) => ({ users: [...s.users, user], accounts: [...s.accounts, acc] }));
    // 서버는 계정 id를 따로 정하므로 만든 뒤 다시 불러옵니다.
    mirror((r) => r.accounts({ action: 'create', loginId, password: input.password, nickname: user.nickname, role: input.role, firm: user.firm, officeId: input.officeId }).then(() => void refresh()));
    return { ok: true };
  },

  resetPassword(userId: string, password: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    const sup = superGuard(userId);
    if (sup) return sup;
    if (password.length < 8) return { ok: false, reason: '비밀번호는 8자 이상이어야 합니다.' };
    set((s) => ({ accounts: s.accounts.map((a) => (a.userId === userId ? { ...a, password: remote ? '' : password } : a)) }));
    mirror((r) => r.accounts({ action: 'reset', userId, password }));
    return { ok: true };
  },

  setAccountActive(userId: string, active: boolean): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    if (userId === state.currentUserId) return { ok: false, reason: '내 계정은 중지할 수 없습니다.' };
    const sup = superGuard(userId);
    if (sup) return sup;
    set((s) => ({ accounts: s.accounts.map((a) => (a.userId === userId ? { ...a, active } : a)) }));
    mirror((r) => r.setActive(userId, active));
    return { ok: true };
  },

  setRole(userId: string, role: Role): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    if (userId === state.currentUserId) return { ok: false, reason: '내 역할은 바꿀 수 없습니다.' };
    const sup = superGuard(userId);
    if (sup) return sup;
    // 어드민이 아닌 역할이 되면 관리자어드민도 풀립니다.
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, role, agentAccess: role === 'client' ? false : u.agentAccess, superAdmin: role === 'admin' ? u.superAdmin : undefined } : u)) }));
    mirror((r) => r.setRole(userId, role));
    return { ok: true };
  },

  setAgentAccess(userId: string, allowed: boolean): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 권한을 바꿀 수 있습니다.' };
    const target = userById(userId);
    if (!target || target.role === 'client') return { ok: false, reason: '로펌 구성원에게만 허용할 수 있습니다.' };
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, agentAccess: allowed } : u)) }));
    mirror((r) => r.setAgentAccess(userId, allowed));
    return { ok: true };
  },

  /** 멤버십 결제가 붙기 전까지는 기기 안에서만 바뀝니다 (서버에서는 어드민·결제만 바꿈). */
  setMembership(level: User['membership']) {
    if (!canJoinMembership(me())) return;
    const id = me().id;
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, membership: level } : u)) }));
  },

  // ---- 메신저 ----
  createRoom(input: { kind: RoomKind; mode: RoomMode; title: string; memberIds: string[] }): RoomCheck & { roomId?: string } {
    const creator = me();
    const members = input.memberIds.map(userById).filter((u): u is User => !!u);
    const check = canCreateRoom(input.kind, input.mode, creator, members);
    if (!check.ok) return check;
    const room: Room = {
      id: newId('r'),
      kind: input.kind,
      mode: input.mode,
      title: input.title.trim() || members.map((m) => m.nickname).join(', ') || '새 대화',
      memberIds: [creator.id, ...members.map((m) => m.id)],
      createdBy: creator.id,
      masters: [creator.id],
      createdAt: nowIso(),
    };
    set((s) => ({ rooms: [room, ...s.rooms] }));
    mirror((r) => r.createRoom(room));
    if (isSelfRoom(room, creator.id)) return { ok: true, roomId: room.id };
    pushMessage(
      room.id,
      SYSTEM_SENDER,
      'system',
      room.mode === 'private'
        ? '사건수행방이 만들어졌습니다. 참여자끼리만 대화하고 AI는 참여하지 않습니다.'
        : 'AI 참여방이 만들어졌습니다. AI가 대화를 읽고 @AI 로 부르면 답합니다.',
    );
    return { ok: true, roomId: room.id };
  },

  /** 방에 사진·파일 보내기 (10개까지). 서버가 있으면 저장소에 올린 뒤 메시지를 남깁니다. */
  sendFiles(roomId: string, files: Attachment[], opts: { replyTo?: string } = {}): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !room.memberIds.includes(me().id)) return { ok: false, reason: '참여 중인 방이 아닙니다.' };
    if (!files.length) return { ok: false, reason: '보낼 파일을 골라 주세요.' };
    if (files.length > 10) return { ok: false, reason: '한 번에 10개까지 보낼 수 있습니다.' };
    if (files.some((f) => (f.size ?? 0) > 50 * 1024 * 1024)) return { ok: false, reason: '파일은 50MB까지 올릴 수 있습니다.' };
    const msg: Message = { id: newId('m'), roomId, senderId: me().id, kind: 'text', text: '', at: nowIso(), attachments: files, ...(opts.replyTo ? { replyTo: opts.replyTo } : {}) };
    set((s) => ({ messages: [...s.messages, msg] }));
    markReadAt(roomId, msg.senderId, msg.at);
    mirror(async (r) => r.postMessage({ ...msg, attachments: await r.uploadRoomFiles(roomId, msg.id, files) }));
    return { ok: true };
  },

  async sendMessage(roomId: string, text: string, opts: { replyTo?: string } = {}) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !text.trim()) return;
    const members = room.memberIds.map(userById).filter((u): u is User => !!u);
    const mentions = parseMentions(text, members);
    pushMessage(roomId, me().id, 'text', text.trim(), { replyTo: opts.replyTo, ...(mentions.length ? { mentions } : {}) });
    // 의뢰인이 절차를 물으면 방 종류와 관계없이 정해진 절차 안내문을 보냅니다.
    if (me().role === 'client') {
      const guide = procedureReply(text, room.caseInfo?.field);
      if (guide) {
        pushMessage(roomId, BOT_SENDER, 'bot', guide);
        return;
      }
    }
    if (!/@ai\b/i.test(text)) return;
    const level = aiAnswerLevel(room, members);
    if (level === 'none') {
      // 사건수행방: AI는 대화에 참여하지 않고 사건 기록에서 진행·배당 정보만 알려 줍니다.
      const ask = asksCaseInfo(text);
      if (ask && (room.kind === 'case' || room.kind === 'consult')) {
        pushMessage(roomId, BOT_SENDER, 'bot', ask === 'assignment' ? assignmentText(room, state.users) : caseStatusText(room, state.users));
        return;
      }
      pushMessage(
        roomId,
        SYSTEM_SENDER,
        'system',
        room.kind === 'case' || room.kind === 'consult'
          ? "사건수행방에서는 AI가 대화에 참여하지 않습니다. '@AI 진행 상황', '@AI 배당 정보'로 사건 정보만 받을 수 있습니다."
          : "이 방은 AI가 참여하지 않는 방입니다. @AI는 'AI 참여방'이나 '나와의 메시지'에서 불러 주세요.",
      );
      return;
    }
    const cmd = parseAiCommand(text);
    if (cmd.kind !== 'chat') {
      if (needsAgentAccess(cmd) && !canUseAgents(me())) {
        pushMessage(roomId, AI_SENDER, 'ai', '이 기능은 어드민 허용이 필요합니다.');
        return;
      }
      pushMessage(roomId, AI_SENDER, 'ai', runCommand(roomId, cmd));
      return;
    }
    let reply: string;
    let refused = false;
    if (supabase) {
      // 실제 AI는 서버에서만 (키는 서버 비밀값에만). 서버가 방·참여자를 다시 확인하고 사건 수행 질문에만 답합니다.
      const { data, error } = await supabase.functions.invoke('axiom', { body: { op: 'room.ask', args: { roomId, text } } });
      const res = data as { ok: boolean; reason?: string; data?: { reply: string | null; reason?: string; refused?: boolean } } | null;
      if (error || !res?.ok || !res.data?.reply) {
        pushMessage(roomId, SYSTEM_SENDER, 'system', res?.data?.reason ?? res?.reason ?? 'AI가 답하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      reply = res.data.reply;
      refused = !!res.data.refused;
    } else {
      const recent = state.messages.filter((m) => m.roomId === roomId).slice(-20).map((m) => ({ senderId: m.senderId, senderKind: m.kind === 'ai' ? 'ai' : 'user', text: m.text }));
      const roleOf = Object.fromEntries(members.map((u) => [u.id, u.role]));
      reply = await getAi().complete({ task: 'room-reply', system: roomAiSystem(level), input: roomAiInput(recent, roleOf, text) });
    }
    if (level === 'general-info' && !refused) reply += '\n\n※ 일반 법률 정보이며 개별 사건의 법률 자문이 아닙니다. 변호사 상담을 받아 보세요.';
    pushMessage(roomId, AI_SENDER, 'ai', reply);
  },

  // ---- 라잇나우 ----
  /** 찾기에서 고른 변호사와의 상담. 사건수행방으로만 열립니다. */
  requestConsult(lawyerId: string, summary: string): RoomCheck & { roomId?: string } {
    const lawyer = findLawyer(lawyerId);
    if (!lawyer) return { ok: false, reason: '변호사 정보를 찾을 수 없습니다.' };
    const client = me();
    const lawyerUser = state.lawyerAccounts[lawyerId];
    const room: Room = {
      id: newId('r'),
      kind: 'consult',
      mode: 'private',
      title: `${lawyer.name} 상담`,
      memberIds: [client.id, ...(lawyerUser ? [lawyerUser] : [])],
      createdBy: client.id,
      createdAt: nowIso(),
      officeId: lawyer.office.id,
      lawyerId,
    };
    set((s) => ({ rooms: [room, ...s.rooms] }));
    mirror((r) => r.openLawyerRoom(room));
    pushMessage(room.id, SYSTEM_SENDER, 'system', `상담 신청이 접수되었습니다. ${lawyer.name} 변호사가 수락하면 대화가 시작됩니다.`);
    pushMessage(room.id, SYSTEM_SENDER, 'system', PRIVATE_CASE_NOTE);
    pushMessage(room.id, BOT_SENDER, 'bot', assignmentText(room, state.users));
    if (summary.trim()) pushMessage(room.id, client.id, 'text', summary.trim());
    if (!lawyerUser) pushMessage(room.id, SYSTEM_SENDER, 'system', '이 변호사는 아직 앱에 가입하지 않아 사무소 연락처로 안내됩니다.');
    return { ok: true, roomId: room.id };
  },

  /** 바로 수임 요청: 사건방이 곧바로 사건수행방으로 열립니다. */
  requestRetain(lawyerId: string, field: string, summary: string): RoomCheck & { roomId?: string } {
    const lawyer = findLawyer(lawyerId);
    if (!lawyer) return { ok: false, reason: '변호사 정보를 찾을 수 없습니다.' };
    const client = me();
    const lawyerUser = state.lawyerAccounts[lawyerId];
    const title = `${field || lawyer.fields[0] || '사건'} · ${lawyer.name}`;
    const room: Room = {
      id: newId('r'),
      kind: 'case',
      mode: 'private',
      title,
      memberIds: [client.id, ...(lawyerUser ? [lawyerUser] : [])],
      createdBy: client.id,
      createdAt: nowIso(),
      officeId: lawyer.office.id,
      lawyerId,
      caseInfo: { title, field: field || lawyer.fields[0] || '', stage: '수임', deadlines: [], documents: [], costs: [], progress: [{ id: newId('p'), at: nowIso(), note: '수임 요청' }] },
    };
    set((s) => ({ rooms: [room, ...s.rooms] }));
    mirror((r) => r.openLawyerRoom(room));
    pushMessage(room.id, SYSTEM_SENDER, 'system', `${lawyer.name} 변호사에게 수임을 요청했습니다. 이 사건방에서 진행 상황을 함께 봅니다.`);
    pushMessage(room.id, SYSTEM_SENDER, 'system', PRIVATE_CASE_NOTE);
    pushMessage(room.id, BOT_SENDER, 'bot', assignmentText(room, state.users));
    if (summary.trim()) pushMessage(room.id, client.id, 'text', summary.trim());
    return { ok: true, roomId: room.id };
  },

  // ---- 메신저 (웍스식 대화 기능) ----

  markRead(roomId: string) {
    const last = [...state.messages].reverse().find((m) => m.roomId === roomId);
    if (!last || (state.reads[roomId]?.[me().id] ?? '') >= last.at) return;
    markReadAt(roomId, me().id, last.at);
    mirror((r) => r.markRead(roomId));
  },

  /** 같은 이모지를 다시 누르면 취소 */
  react(messageId: string, emoji: string) {
    const uid = me().id;
    const undo = state.messages.find((m) => m.id === messageId)?.reactions?.[uid] === emoji;
    updateMessage(messageId, (m) => {
      const reactions = { ...m.reactions };
      if (reactions[uid] === emoji) delete reactions[uid];
      else reactions[uid] = emoji;
      return { ...m, reactions };
    });
    mirror((r) => r.react(messageId, undo ? undefined : emoji));
  },

  /** 내가 보낸 메시지를 모두에게서 회수 */
  recall(messageId: string): RoomCheck {
    const m = state.messages.find((x) => x.id === messageId);
    if (!m || m.senderId !== me().id) return { ok: false, reason: '내가 보낸 메시지만 회수할 수 있습니다.' };
    updateMessage(messageId, (x) => ({ ...x, text: '', recalled: true, reactions: {}, mentions: [], attachments: undefined }));
    mirror((r) => r.recall(messageId));
    return { ok: true };
  },

  /** 나에게서만 삭제 */
  deleteForMe(messageId: string) {
    const uid = me().id;
    updateMessage(messageId, (m) => ({ ...m, deletedFor: [...(m.deletedFor ?? []), uid] }));
    mirror((r) => r.hideMessage(messageId));
  },

  forward(messageId: string, toRoomId: string): RoomCheck {
    const m = state.messages.find((x) => x.id === messageId);
    const to = state.rooms.find((r) => r.id === toRoomId);
    if (!m || m.recalled) return { ok: false, reason: '전달할 메시지를 찾을 수 없습니다.' };
    if (!to || !to.memberIds.includes(me().id)) return { ok: false, reason: '참여 중인 방으로만 전달할 수 있습니다.' };
    if (m.bundle) {
      pushMessage(toRoomId, me().id, 'text', m.text, { bundle: m.bundle });
      return { ok: true };
    }
    const origin = m.forwardOf ?? { senderId: m.senderId, text: m.text };
    pushMessage(toRoomId, me().id, 'text', origin.text, { forwardOf: origin });
    return { ok: true };
  },

  /** 여러 말풍선을 골라 한 번에 전달. 하나면 일반 전달, 여럿이면 묶음으로 보냅니다. */
  forwardMany(messageIds: string[], toRoomId: string): RoomCheck {
    const picked = state.messages.filter((m) => messageIds.includes(m.id) && !m.recalled && m.senderId !== SYSTEM_SENDER);
    if (!picked.length) return { ok: false, reason: '전달할 메시지를 골라 주세요.' };
    if (picked.length === 1) return actions.forward(picked[0].id, toRoomId);
    const to = state.rooms.find((r) => r.id === toRoomId);
    if (!to || !to.memberIds.includes(me().id)) return { ok: false, reason: '참여 중인 방으로만 전달할 수 있습니다.' };
    const source = state.rooms.find((r) => r.id === picked[0].roomId);
    // 묶음 안의 묶음·전달은 펼쳐서 원래 보낸 사람으로 넣습니다.
    const items = picked.flatMap((m) =>
      m.bundle ? m.bundle.items : [{ senderId: m.forwardOf?.senderId ?? m.senderId, text: m.forwardOf?.text ?? m.text, at: m.at }],
    );
    const bundle = { title: source ? (source.kind === 'direct' ? userById(source.memberIds.find((x) => x !== me().id) ?? '')?.nickname ?? source.title : source.title) : '대화', items };
    pushMessage(toRoomId, me().id, 'text', items.map((i) => i.text).join('\n'), { bundle });
    return { ok: true };
  },

  setNotice(messageId: string): RoomCheck {
    const m = state.messages.find((x) => x.id === messageId);
    if (!m || m.recalled || !m.text) return { ok: false, reason: '공지로 올릴 수 없는 메시지입니다.' };
    const notice = { id: newId('nt'), messageId, text: m.text, by: me().id, at: nowIso() };
    updateRoom(m.roomId, (r) => ({ ...r, notices: [notice, ...(r.notices ?? []).filter((n) => n.messageId !== messageId)].slice(0, 5), noticeHiddenBy: [] }));
    mirror((r) => r.setNotice(notice.id, m.roomId, messageId, notice.text));
    pushMessage(m.roomId, SYSTEM_SENDER, 'system', `${me().nickname}님이 공지를 등록했습니다.`);
    return { ok: true };
  },

  removeNotice(roomId: string, noticeId: string) {
    updateRoom(roomId, (r) => ({ ...r, notices: (r.notices ?? []).filter((n) => n.id !== noticeId) }));
    mirror((r) => r.removeNotice(noticeId));
  },

  /** 공지 '다시 보지 않기' */
  hideNotices(roomId: string) {
    const uid = me().id;
    updateRoom(roomId, (r) => ({ ...r, noticeHiddenBy: [...(r.noticeHiddenBy ?? []), uid] }));
    mirror((r) => r.hideNotices(roomId));
  },

  togglePin(roomId: string) {
    const uid = me().id;
    const on = !state.rooms.find((r) => r.id === roomId)?.pinnedBy?.includes(uid);
    updateRoom(roomId, (r) => ({ ...r, pinnedBy: r.pinnedBy?.includes(uid) ? r.pinnedBy.filter((x) => x !== uid) : [...(r.pinnedBy ?? []), uid] }));
    mirror((r) => r.setPinned(roomId, on));
  },

  setNotify(roomId: string, level: NotifyLevel) {
    const uid = me().id;
    updateRoom(roomId, (r) => ({ ...r, notify: { ...r.notify, [uid]: level } }));
    mirror((r) => r.setNotify(roomId, level));
  },

  /** 목록에서 숨기기. 새 메시지가 오면 다시 보입니다. */
  hideRoom(roomId: string) {
    const uid = me().id;
    const at = nowIso();
    updateRoom(roomId, (r) => ({ ...r, hiddenAt: { ...r.hiddenAt, [uid]: at } }));
    mirror((r) => r.setHidden(roomId, at));
  },

  leaveRoom(roomId: string): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room || !room.memberIds.includes(u.id)) return { ok: false, reason: '참여 중인 방이 아닙니다.' };
    if (room.kind === 'case' || room.kind === 'consult') return { ok: false, reason: '상담·사건방은 나갈 수 없습니다.' };
    updateRoom(roomId, (r) => ({ ...r, memberIds: r.memberIds.filter((x) => x !== u.id), pinnedBy: r.pinnedBy?.filter((x) => x !== u.id), masters: roomMasters(r).filter((x) => x !== u.id) }));
    pushMessage(roomId, SYSTEM_SENDER, 'system', `${u.nickname}님이 나갔습니다.`);
    // 마지막 마스터가 나가면 남은 사람 중 먼저 들어온 사람이 마스터가 됩니다.
    const after = state.rooms.find((r) => r.id === roomId)!;
    if (!after.masters?.length && after.memberIds.length) {
      const next = after.memberIds[0];
      updateRoom(roomId, (r) => ({ ...r, masters: [next] }));
      pushMessage(roomId, SYSTEM_SENDER, 'system', `${userById(next)?.nickname ?? ''}님이 마스터가 되었습니다.`);
    }
    // 안내 메시지를 먼저 올리고 나갑니다 (나간 뒤에는 그 방에 쓸 수 없음). 마스터 넘기기는 서버도 같은 규칙.
    mirror((r) => r.leaveRoom(roomId));
    return { ok: true };
  },

  /** 대화방 이름 바꾸기: 그 방의 마스터만, 30자까지. 모두에게 같은 이름으로 보이고, 안내 메시지는 남기지 않습니다. */
  renameRoom(roomId: string, title: string): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    const t = title.trim();
    if (!room || !room.memberIds.includes(u.id) || !isMaster(room, u.id)) return { ok: false, reason: '마스터만 방 이름을 바꿀 수 있습니다.' };
    if (!t) return { ok: false, reason: '방 이름을 적어 주세요.' };
    if (t.length > 30) return { ok: false, reason: '방 이름은 30자까지 쓸 수 있습니다.' };
    if (t === room.title) return { ok: true };
    updateRoom(roomId, (r) => ({ ...r, title: t }));
    mirror((r) => r.renameRoom(roomId, t));
    return { ok: true };
  },

  /** AI 참여 켜기·끄기: 어드민만. 사건방·상담방은 켤 수 없고, 바꾸면 방에 안내를 남깁니다. */
  setRoomAi(roomId: string, on: boolean): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (u.role !== 'admin') return { ok: false, reason: '어드민만 AI 참여를 바꿀 수 있습니다.' };
    if (!room || !room.memberIds.includes(u.id)) return { ok: false, reason: '참여 중인 방이 아닙니다.' };
    if (on && (room.kind === 'case' || room.kind === 'consult')) return { ok: false, reason: '사건방·상담방은 AI 참여를 켤 수 없습니다.' };
    if ((room.mode === 'ai') === on) return { ok: true };
    updateRoom(roomId, (r) => ({ ...r, mode: on ? 'ai' : 'private' }));
    mirror((r) => r.setRoomAi(roomId, on));
    pushMessage(roomId, SYSTEM_SENDER, 'system', on ? `어드민(${u.nickname})이 이 방의 AI 참여를 켰습니다. 이제 @AI로 부르면 AI가 최근 대화를 읽고 답합니다.` : `어드민(${u.nickname})이 이 방의 AI 참여를 껐습니다. AI는 이 방의 대화를 읽지 않습니다.`);
    return { ok: true };
  },

  /** 마스터 지정·해제. 마스터만 할 수 있고, 마스터는 한 명 이상 남아야 합니다. */
  setMaster(roomId: string, userId: string, on: boolean): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room || !isMaster(room, u.id)) return { ok: false, reason: '마스터만 할 수 있습니다.' };
    if (!room.memberIds.includes(userId)) return { ok: false, reason: '대화 참여자만 마스터가 될 수 있습니다.' };
    const cur = roomMasters(room);
    if (on === cur.includes(userId)) return { ok: true };
    const next = on ? [...cur, userId] : cur.filter((x) => x !== userId);
    if (!next.length) return { ok: false, reason: '마스터는 한 명 이상 있어야 합니다.' };
    updateRoom(roomId, (r) => ({ ...r, masters: next }));
    mirror((r) => r.setMaster(roomId, userId, on));
    const name = userById(userId)?.nickname ?? '';
    pushMessage(roomId, SYSTEM_SENDER, 'system', on ? `${u.nickname}님이 ${name}님을 마스터로 지정했습니다.` : `${name}님의 마스터 권한이 해제되었습니다.`);
    return { ok: true };
  },

  /** 강퇴: 마스터만. 상담·사건방은 의뢰인 보호를 위해 강퇴할 수 없습니다. */
  kick(roomId: string, userId: string): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room || !isMaster(room, u.id)) return { ok: false, reason: '마스터만 내보낼 수 있습니다.' };
    if (userId === u.id) return { ok: false, reason: '나 자신은 내보낼 수 없습니다. 나가기를 이용해 주세요.' };
    if (!room.memberIds.includes(userId)) return { ok: false, reason: '대화 참여자가 아닙니다.' };
    if (room.kind === 'case' || room.kind === 'consult') return { ok: false, reason: '상담·사건방에서는 참여자를 내보낼 수 없습니다.' };
    updateRoom(roomId, (r) => ({ ...r, memberIds: r.memberIds.filter((x) => x !== userId), pinnedBy: r.pinnedBy?.filter((x) => x !== userId), masters: roomMasters(r).filter((x) => x !== userId) }));
    mirror((r) => r.kick(roomId, userId));
    pushMessage(roomId, SYSTEM_SENDER, 'system', `${u.nickname}님이 ${userById(userId)?.nickname ?? ''}님을 내보냈습니다.`);
    return { ok: true };
  },

  /** 멤버 초대. 1:1 방에서 초대하면 새 그룹방을 만듭니다. */
  invite(roomId: string, userIds: string[]): RoomCheck & { roomId?: string } {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room || !room.memberIds.includes(u.id)) return { ok: false, reason: '참여 중인 방이 아닙니다.' };
    const add = userIds.filter((id) => !room.memberIds.includes(id) && userById(id));
    if (!add.length) return { ok: false, reason: '초대할 사람을 골라 주세요.' };
    if (room.kind === 'direct') return actions.startChat([...room.memberIds.filter((x) => x !== u.id), ...add]);
    updateRoom(roomId, (r) => ({ ...r, memberIds: [...r.memberIds, ...add] }));
    mirror((r) => r.addMembers(roomId, add));
    pushMessage(roomId, SYSTEM_SENDER, 'system', `${u.nickname}님이 ${add.map((id) => userById(id)!.nickname).join(', ')}님을 초대했습니다.`);
    return { ok: true, roomId };
  },

  /** 멤버 선택으로 대화 시작: 한 명이면 1:1, 여러 명이면 그룹방 */
  startChat(userIds: string[], title = ''): RoomCheck & { roomId?: string } {
    const ids = [...new Set(userIds)].filter((id) => id !== me().id);
    if (!ids.length) return { ok: false, reason: '대화할 사람을 골라 주세요.' };
    if (ids.length === 1 && !title) return { ok: true, roomId: actions.openDirect(ids[0]) };
    return actions.createRoom({ kind: 'group', mode: 'private', title, memberIds: ids });
  },

  /** 어드민: 여러 사람의 직책을 한 번에 정합니다. 빈 값이면 직책을 지웁니다. */
  setTitles(userIds: string[], title: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 직책을 정할 수 있습니다.' };
    const ids = userIds.filter((id) => userById(id));
    if (!ids.length) return { ok: false, reason: '직책을 바꿀 사람을 골라 주세요.' };
    const t = title.trim();
    if (t.length > 40) return { ok: false, reason: '직책은 40자 이내로 적어 주세요.' };
    set((s) => ({ users: s.users.map((x) => (ids.includes(x.id) ? { ...x, title: t || undefined } : x)) }));
    mirror((r) => r.setTitles(ids, t));
    return { ok: true };
  },

  /** 내 프로필 수정 (직책·부서·지점은 어드민이 정합니다) */
  updateProfile(patch: { nickname?: string; photo?: string | null; status?: string; presence?: Presence; phone?: string; email?: string; birthday?: string }): RoomCheck {
    const u = me();
    const next = { ...u };
    if (patch.nickname !== undefined) {
      const n = patch.nickname.trim();
      if (!n) return { ok: false, reason: '이름을 입력해 주세요.' };
      if (n.length > 20) return { ok: false, reason: '이름은 20자 이내로 적어 주세요.' };
      next.nickname = n;
    }
    if (patch.email !== undefined) {
      const e = patch.email.trim();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, reason: '메일 주소 형식이 맞지 않습니다.' };
      next.email = e || undefined;
    }
    if (patch.phone !== undefined) {
      const p = patch.phone.trim();
      if (p && !/^[0-9+\-\s()]{7,20}$/.test(p)) return { ok: false, reason: '전화번호 형식이 맞지 않습니다.' };
      next.phone = p || undefined;
    }
    if (patch.birthday !== undefined) {
      const b = patch.birthday.trim();
      if (b && (!/^\d{4}-\d{2}-\d{2}$/.test(b) || Number.isNaN(Date.parse(b)))) return { ok: false, reason: '생일은 2000-01-31 형식으로 적어 주세요.' };
      next.birthday = b || undefined;
    }
    if (patch.status !== undefined) {
      if (patch.status.trim().length > 60) return { ok: false, reason: '상태 메시지는 60자 이내로 적어 주세요.' };
      next.status = patch.status.trim() || undefined;
    }
    if (patch.photo !== undefined) next.photo = patch.photo ?? undefined;
    if (patch.presence !== undefined) next.presence = patch.presence;
    set((s) => ({ users: s.users.map((x) => (x.id === u.id ? next : x)) }));
    // 사진은 파일 저장소(4단계)가 붙으면 함께 올립니다.
    const keys = ['nickname', 'status', 'presence', 'phone', 'email', 'birthday'] as const;
    const patchRow = Object.fromEntries(keys.filter((k) => patch[k] !== undefined).map((k) => [k, next[k] ?? null]));
    if (Object.keys(patchRow).length) mirror((r) => r.updateProfile(patchRow));
    return { ok: true };
  },

  // ---- 오픈대화방 ----

  createOpenRoom(input: { title: string; description: string; tags: string; max: number; alias: string; password?: string }): RoomCheck & { roomId?: string } {
    const u = me();
    if (!canUseOpenChat(u)) return { ok: false, reason: '오픈대화방을 쓸 수 없는 계정입니다.' };
    const title = input.title.trim();
    if (!title) return { ok: false, reason: '방 이름을 입력해 주세요.' };
    if (title.length > 30) return { ok: false, reason: '방 이름은 30자 이내로 적어 주세요.' };
    if (!OPEN_MAX_OPTIONS.includes(input.max)) return { ok: false, reason: '최대 인원을 골라 주세요.' };
    const bad = checkAlias(undefined, input.alias, u);
    if (bad) return { ok: false, reason: bad };
    const pw = input.password?.trim() ?? '';
    const badPw = pw ? checkOpenPassword(pw) : undefined;
    if (badPw) return { ok: false, reason: badPw };
    const room: OpenRoom = {
      ...(pw ? { password: pw } : {}),
      id: newId('o'), title, description: input.description.trim().slice(0, 200), tags: parseTags(input.tags), hostId: u.id, max: input.max, createdAt: nowIso(), banned: [],
      members: [{ userId: u.id, alias: input.alias.trim(), joinedAt: nowIso() }],
    };
    if (remote) {
      // 비밀번호는 서버에서 암호화해 보관하고 앱에는 '잠김'만 남깁니다.
      delete room.password;
      if (pw) room.locked = true;
    }
    set((s) => ({ openRooms: [room, ...s.openRooms] }));
    mirror((r) => r.createOpenRoom(room, input.alias.trim(), pw));
    pushOpen(room.id, u.id, `${input.alias.trim()}님이 방을 만들었습니다.`, true);
    return { ok: true, roomId: room.id };
  },

  joinOpenRoom(roomId: string, alias: string, password = ''): RoomCheck {
    const u = me();
    const room = state.openRooms.find((r) => r.id === roomId);
    if (!room || !canUseOpenChat(u)) return { ok: false, reason: '들어갈 수 없는 방입니다.' };
    if (isOpenMember(room, u.id)) return { ok: true };
    if (room.banned.includes(u.id)) return { ok: false, reason: '방장이 내보낸 방에는 다시 들어갈 수 없습니다.' };
    if (room.members.length >= room.max) return { ok: false, reason: '방이 가득 찼습니다.' };
    if (room.password && room.password !== password.trim()) return { ok: false, reason: '비밀번호가 맞지 않습니다.' };
    const bad = checkAlias(room, alias, u);
    if (bad) return { ok: false, reason: bad };
    updateOpen(roomId, (r) => ({ ...r, members: [...r.members, { userId: u.id, alias: alias.trim(), joinedAt: nowIso() }] }));
    // 서버 연결 시 비밀번호는 서버가 확인합니다 (틀리면 사유가 뜨고 방에서 다시 빠짐).
    mirror((r) => r.joinOpenRoom(roomId, alias.trim(), password.trim()).then(() => void refresh()));
    pushOpen(roomId, u.id, `${alias.trim()}님이 들어왔습니다.`, true);
    return { ok: true };
  },

  sendOpen(roomId: string, text: string): RoomCheck {
    const u = me();
    const room = state.openRooms.find((r) => r.id === roomId);
    if (!room || !isOpenMember(room, u.id)) return { ok: false, reason: '참여 중인 방이 아닙니다.' };
    if (!text.trim()) return { ok: false, reason: '' };
    const m = pushOpen(roomId, u.id, text.trim());
    mirror((r) => r.sendOpen(m.id, roomId, m.text));
    return { ok: true };
  },

  /** 나가기. 방장이 나가면 가장 먼저 들어온 사람이 방장이 되고, 아무도 없으면 방이 없어집니다. */
  leaveOpenRoom(roomId: string): RoomCheck {
    const u = me();
    const room = state.openRooms.find((r) => r.id === roomId);
    if (!room || !isOpenMember(room, u.id)) return { ok: false, reason: '참여 중인 방이 아닙니다.' };
    const alias = aliasOf(room, u.id)!;
    const members = room.members.filter((m) => m.userId !== u.id);
    mirror((r) => r.leaveOpenRoom(roomId));
    if (!members.length) {
      set((s) => ({ openRooms: s.openRooms.filter((r) => r.id !== roomId), openMessages: s.openMessages.filter((m) => m.roomId !== roomId) }));
      return { ok: true };
    }
    const hostId = room.hostId === u.id ? members[0].userId : room.hostId;
    updateOpen(roomId, (r) => ({ ...r, members, hostId }));
    pushOpen(roomId, u.id, `${alias}님이 나갔습니다.`, true);
    if (hostId !== room.hostId) pushOpen(roomId, hostId, `${members[0].alias}님이 방장이 되었습니다.`, true);
    return { ok: true };
  },

  /** 방장 또는 관리자어드민: 참여자 내보내기 (다시 못 들어옴) */
  kickOpen(roomId: string, userId: string): RoomCheck {
    const u = me();
    const room = state.openRooms.find((r) => r.id === roomId);
    const manager = canManageOpen(u);
    if (!room || (room.hostId !== u.id && !manager)) return { ok: false, reason: '방장만 내보낼 수 있습니다.' };
    if (userId === u.id || !isOpenMember(room, userId)) return { ok: false, reason: '내보낼 수 없는 참여자입니다.' };
    const alias = aliasOf(room, userId)!;
    const members = room.members.filter((m) => m.userId !== userId);
    if (!members.length) return actions.deleteOpenRoom(roomId);
    mirror((r) => r.kickOpen(roomId, userId));
    const hostId = room.hostId === userId ? members[0].userId : room.hostId;
    updateOpen(roomId, (r) => ({ ...r, members, hostId, banned: [...r.banned, userId] }));
    pushOpen(roomId, u.id, `${room.hostId === u.id ? '방장' : '관리자'}이 ${alias}님을 내보냈습니다.`, true);
    return { ok: true };
  },

  /** 방장: 비밀번호 설정·해제 (빈 값이면 해제) */
  setOpenPassword(roomId: string, password: string): RoomCheck {
    const room = state.openRooms.find((r) => r.id === roomId);
    if (!room || room.hostId !== me().id) return { ok: false, reason: '방장만 비밀번호를 바꿀 수 있습니다.' };
    const pw = password.trim();
    const bad = pw ? checkOpenPassword(pw) : undefined;
    if (bad) return { ok: false, reason: bad };
    updateOpen(roomId, (r) => {
      const next = { ...r };
      if (remote) next.locked = !!pw;
      else if (pw) next.password = pw;
      else delete next.password;
      return next;
    });
    mirror((r) => r.setOpenPassword(roomId, pw));
    return { ok: true };
  },

  /** 방장 또는 관리자어드민: 방 없애기 */
  deleteOpenRoom(roomId: string): RoomCheck {
    const room = state.openRooms.find((r) => r.id === roomId);
    if (!room || (room.hostId !== me().id && !canManageOpen(me()))) return { ok: false, reason: '방장만 방을 없앨 수 있습니다.' };
    set((s) => ({ openRooms: s.openRooms.filter((r) => r.id !== roomId), openMessages: s.openMessages.filter((m) => m.roomId !== roomId) }));
    mirror((r) => r.deleteOpenRoom(roomId));
    return { ok: true };
  },

  /** 관리자어드민 지정·해제: 관리자어드민만, 어드민 계정에만, 한 명 이상 남아야 합니다. */
  setSuperAdmin(userId: string, on: boolean): RoomCheck {
    if (!canManageOpen(me())) return { ok: false, reason: '관리자어드민만 지정할 수 있습니다.' };
    const target = userById(userId);
    if (!target || target.role !== 'admin') return { ok: false, reason: '어드민 계정만 관리자어드민이 될 수 있습니다.' };
    if (!on && state.users.filter((x) => x.superAdmin && x.role === 'admin').length <= 1 && target.superAdmin) return { ok: false, reason: '관리자어드민은 한 명 이상 있어야 합니다.' };
    set((s) => ({ users: s.users.map((x) => (x.id === userId ? { ...x, superAdmin: on || undefined } : x)) }));
    mirror((r) => r.setSuperAdmin(userId, on));
    return { ok: true };
  },

  toggleFavorite(userId: string) {
    const uid = me().id;
    const cur = state.favorites[uid] ?? [];
    set((s) => ({ favorites: { ...s.favorites, [uid]: cur.includes(userId) ? cur.filter((x) => x !== userId) : [...cur, userId] } }));
    mirror((r) => r.toggleFavorite(userId, !cur.includes(userId)));
  },

  shareContact(roomId: string, contactId: string): RoomCheck {
    const c = userById(contactId);
    if (!c) return { ok: false, reason: '연락처를 찾을 수 없습니다.' };
    pushMessage(roomId, me().id, 'contact', displayName(c), { contactId });
    return { ok: true };
  },

  /** 나와의 메시지 (메모처럼 쓰는 나 혼자 방). 있으면 기존 방 */
  openSelfChat(): string {
    const my = me().id;
    const existing = state.rooms.find((r) => isSelfRoom(r, my));
    if (existing) {
      if (existing.hiddenAt?.[my]) {
        updateRoom(existing.id, (r) => ({ ...r, hiddenAt: { ...r.hiddenAt, [my]: '' } }));
        mirror((r) => r.setHidden(existing.id, null));
      }
      return existing.id;
    }
    return actions.createRoom({ kind: 'group', mode: 'private', title: SELF_ROOM_TITLE, memberIds: [] }).roomId!;
  },

  /** 주소록에서 1:1 대화 열기 (있으면 기존 방) */
  openDirect(otherId: string): string {
    const my = me().id;
    const existing = state.rooms.find((r) => r.kind === 'direct' && r.memberIds.length === 2 && r.memberIds.includes(my) && r.memberIds.includes(otherId));
    if (existing) {
      if (existing.hiddenAt?.[my]) {
        updateRoom(existing.id, (r) => ({ ...r, hiddenAt: { ...r.hiddenAt, [my]: '' } }));
        mirror((r) => r.setHidden(existing.id, null));
      }
      return existing.id;
    }
    const res = actions.createRoom({ kind: 'direct', mode: 'private', title: '', memberIds: [otherId] });
    return res.roomId!;
  },

  /** 상담방을 사건방으로 올립니다. 담당 변호사가 방에 있어야 합니다. */
  promoteToCase(roomId: string, title: string, field: string): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || room.kind !== 'consult') return { ok: false, reason: '상담방만 사건방으로 올릴 수 있습니다.' };
    const members = room.memberIds.map(userById).filter((u): u is User => !!u);
    if (!members.some((u) => u.role === 'lawyer')) return { ok: false, reason: '담당 변호사가 방에 있어야 수임할 수 있습니다.' };
    const caseInfo: CaseInfo = { title: title || room.title, field, stage: '수임', deadlines: [], documents: [], costs: [], progress: [{ id: newId('p'), at: nowIso(), note: '수임' }] };
    updateRoom(roomId, (r) => ({ ...r, kind: 'case', title: caseInfo.title, caseInfo }));
    mirror((r) => r.promoteCase(roomId, caseInfo.title, field, caseInfo.progress[0].id));
    pushMessage(roomId, SYSTEM_SENDER, 'system', '사건방으로 전환되었습니다. 진행 상황·기일·서류가 이 방에서 공유됩니다.');
    const promoted = state.rooms.find((r) => r.id === roomId);
    if (promoted) pushMessage(roomId, BOT_SENDER, 'bot', assignmentText(promoted, state.users));
    return { ok: true };
  },

  addCaseEntry(roomId: string, entry: { type: 'deadline' | 'document' | 'cost' | 'progress'; label: string; date?: string; time?: string; place?: string; amount?: number }): RoomCheck {
    // 기일은 알람과 함께 올립니다.
    if (entry.type === 'deadline') return actions.syncHearing(roomId, { change: 'new', label: entry.label, date: entry.date ?? '', time: entry.time, place: entry.place });
    const id = newId('ce');
    updateRoom(roomId, (r) => {
      if (!r.caseInfo) return r;
      const c = { ...r.caseInfo };
      if (entry.type === 'document') c.documents = [...c.documents, { id, name: entry.label, addedAt: nowIso() }];
      if (entry.type === 'cost') c.costs = [...c.costs, { id, label: entry.label, amount: entry.amount ?? 0 }];
      if (entry.type === 'progress') c.progress = [...c.progress, { id, at: nowIso(), note: entry.label }];
      return { ...r, caseInfo: c };
    });
    mirror((r) => r.addCaseEntry(id, roomId, entry.type, entry.label, entry.amount));
    if (entry.type === 'progress') pushMessage(roomId, BOT_SENDER, 'bot', `진행 알림\n· ${entry.label}`);
    else pushMessage(roomId, SYSTEM_SENDER, 'system', `${entry.type === 'document' ? '서류' : '비용'} 추가: ${entry.label}`);
    return { ok: true };
  },

  /**
   * 기일 업데이트: 대륜탑 연동(서버가 붙으면 대륜탑이 보냄) 또는 담당 변호사 입력.
   * 사건방 기일을 고치고, 알람 카드를 올려 공지로 고정하고, 방의 모든 사람에게 확인 요청을 겁니다.
   */
  syncHearing(roomId: string, update: { hearingId?: string; change: HearingChange; label: string; date: string; time?: string; place?: string }, source: HearingSource = 'manual'): RoomCheck & { alertId?: string } {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room?.caseInfo) return { ok: false, reason: '사건방에서만 기일을 올릴 수 있습니다.' };
    const firmMember = u.role !== 'client' && room.memberIds.includes(u.id);
    if (!firmMember && !(source === 'daeryuntop' && canManageOpen(u))) return { ok: false, reason: '담당 변호사·직원만 기일을 바꿀 수 있습니다.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(update.date) || Number.isNaN(Date.parse(update.date))) return { ok: false, reason: '날짜는 2026-11-02 형식으로 적어 주세요.' };
    if (update.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(update.time)) return { ok: false, reason: '시각은 14:30 형식으로 적어 주세요.' };
    if (!update.label.trim()) return { ok: false, reason: '기일 이름을 적어 주세요.' };
    const prev = update.hearingId ? room.caseInfo.deadlines.find((d) => d.id === update.hearingId) : undefined;
    if (update.change !== 'new' && !prev) return { ok: false, reason: '바꿀 기일을 찾을 수 없습니다.' };
    const hearing: Hearing = { id: prev?.id ?? newId('dl'), label: update.label.trim(), date: update.date, ...(update.time ? { time: update.time } : {}), ...(update.place?.trim() ? { place: update.place.trim() } : {}), source };
    const progress = { id: newId('p'), at: nowIso(), note: `${CHANGE_LABEL[update.change]}: ${hearing.label} ${whenLabel(hearing.date, hearing.time)}` };
    updateRoom(roomId, (r) => {
      const c = { ...r.caseInfo! };
      if (update.change === 'cancelled') c.deadlines = c.deadlines.filter((d) => d.id !== hearing.id);
      else c.deadlines = prev ? c.deadlines.map((d) => (d.id === hearing.id ? hearing : d)) : [...c.deadlines, hearing];
      c.progress = [...c.progress, progress];
      return { ...r, caseInfo: c };
    });
    const alertId = newId('ha');
    const base = { change: update.change, label: hearing.label, date: hearing.date, time: hearing.time, place: hearing.place, prevDate: prev?.date, prevTime: prev?.time, source };
    // 알람 카드 메시지는 서버의 sync_hearing이 같은 id로 만듭니다.
    const msg = silently(() => pushMessage(roomId, BOT_SENDER, 'bot', '', { hearingAlertId: alertId }));
    const at = nowIso();
    const alert: HearingAlert = {
      id: alertId, roomId, hearingId: hearing.id, ...base, at, messageId: msg.id,
      recipients: recipientsOf(room, state.users),
      // 변호사가 직접 올린 경우 본인은 이미 알고 있으므로 확인 처리
      ackedBy: source === 'manual' ? { [u.id]: at } : {},
    };
    const summary = alertText(base).split('\n').slice(0, 2).join('\n');
    set((s) => ({ hearingAlerts: [...s.hearingAlerts, alert] }));
    const noticeId = newId('nt');
    updateRoom(roomId, (r) => ({ ...r, notices: [{ id: noticeId, messageId: msg.id, text: summary, by: BOT_SENDER, at }, ...(r.notices ?? []).filter((n) => n.by !== BOT_SENDER)].slice(0, 5), noticeHiddenBy: [] }));
    mirror((r) => r.syncHearing(alert, { prevId: prev?.id, noticeId, noticeText: summary, progressId: progress.id, progressNote: progress.note }));
    return { ok: true, alertId };
  },

  /** '확인했습니다': 방에 확인 기록이 남아 상대도 압니다. */
  ackHearing(alertId: string): RoomCheck {
    const u = me();
    const a = state.hearingAlerts.find((x) => x.id === alertId);
    if (!a || !a.recipients.includes(u.id)) return { ok: false, reason: '알람을 찾을 수 없습니다.' };
    if (a.ackedBy[u.id]) return { ok: true };
    set((s) => ({ hearingAlerts: s.hearingAlerts.map((x) => (x.id === alertId ? { ...x, ackedBy: { ...x.ackedBy, [u.id]: nowIso() } } : x)) }));
    mirror((r) => r.ackHearing(alertId));
    pushMessage(a.roomId, SYSTEM_SENDER, 'system', `${u.nickname}님이 ${a.label} 알람을 확인했습니다.`);
    return { ok: true };
  },

  /** 확인하지 않은 사람에게 다시 알리기 (담당 변호사·직원) */
  remindHearing(alertId: string): RoomCheck {
    const u = me();
    const a = state.hearingAlerts.find((x) => x.id === alertId);
    if (!a) return { ok: false, reason: '알람을 찾을 수 없습니다.' };
    if (u.role === 'client' || !a.recipients.includes(u.id)) return { ok: false, reason: '담당 변호사·직원만 다시 알릴 수 있습니다.' };
    const missing = a.recipients.filter((id) => !a.ackedBy[id]).map(userById).filter((x): x is User => !!x);
    if (!missing.length) return { ok: false, reason: '모두 확인했습니다.' };
    mirror((r) => r.remindHearing(alertId)); // 서버: 확인 안 한 사람 폰으로 다시 푸시
    pushMessage(a.roomId, BOT_SENDER, 'bot', `기일 알람 확인 요청\n${missing.map((x) => `@${x.nickname}`).join(' ')} ${a.label} ${whenLabel(a.date, a.time)} 알람을 확인해 주세요.`, { mentions: missing.map((x) => x.id) });
    return { ok: true };
  },

  // ---- 불변기간 ----

  /** 불변기간 등록 (사건방의 변호사·직원). 담당 변호사를 고르지 않으면 사건방의 변호사 전원이 받습니다. */
  addLimit(roomId: string, input: { label: string; due: string; lawyerId?: string }): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room?.caseInfo) return { ok: false, reason: '사건방에서만 불변기간을 올릴 수 있습니다.' };
    if (u.role === 'client' || !room.memberIds.includes(u.id)) return { ok: false, reason: '담당 변호사·직원만 불변기간을 관리할 수 있습니다.' };
    if (!input.label.trim()) return { ok: false, reason: '불변기간 이름을 적어 주세요.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due) || Number.isNaN(Date.parse(input.due))) return { ok: false, reason: '만료일은 2026-11-02 형식으로 적어 주세요.' };
    if (input.lawyerId && !limitLawyerIds(room).includes(input.lawyerId)) return { ok: false, reason: '이 사건방의 변호사만 담당으로 지정할 수 있습니다.' };
    const d: FixedDeadline = { id: newId('lm'), label: input.label.trim(), due: input.due, source: 'manual', ...(input.lawyerId ? { lawyerId: input.lawyerId } : {}) };
    updateLimits(roomId, (ls) => [...ls, d].sort((a, b) => a.due.localeCompare(b.due)));
    mirror((r) => r.addDeadline(d.id, roomId, d.label, d.due, d.lawyerId));
    checkLimitsLocally();
    return { ok: true };
  },

  /** 조치 완료 표시 / 취소 */
  setLimitHandled(roomId: string, id: string, done: boolean): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room?.caseInfo?.limits?.some((d) => d.id === id)) return { ok: false, reason: '불변기간을 찾을 수 없습니다.' };
    if (u.role === 'client' || !room.memberIds.includes(u.id)) return { ok: false, reason: '담당 변호사·직원만 불변기간을 관리할 수 있습니다.' };
    const at = nowIso();
    updateLimits(roomId, (ls) => ls.map((d) => (d.id === id ? { ...d, handledAt: done ? at : undefined } : d)));
    // 이미 올라간 경고 글에도 표시 (서버는 set_deadline_handled가 함께 고침)
    silently(() =>
      set((s) => ({
        posts: s.posts.map((p) => (p.sourceId !== `deadline:${id}` ? p : { ...p, title: done ? (p.title.endsWith(' (조치 완료)') ? p.title : `${p.title} (조치 완료)`) : p.title.replace(' (조치 완료)', '') })),
      })),
    );
    mirror((r) => r.setDeadlineHandled(id, done));
    if (!done) checkLimitsLocally();
    return { ok: true };
  },

  removeLimit(roomId: string, id: string): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    const d = room?.caseInfo?.limits?.find((x) => x.id === id);
    if (!room || !d) return { ok: false, reason: '불변기간을 찾을 수 없습니다.' };
    if (u.role === 'client' || !room.memberIds.includes(u.id)) return { ok: false, reason: '담당 변호사·직원만 불변기간을 관리할 수 있습니다.' };
    if (d.source === 'daeryuntop') return { ok: false, reason: '대륜탑에서 온 불변기간은 대륜탑에서 바꿔 주세요.' };
    updateLimits(roomId, (ls) => ls.filter((x) => x.id !== id));
    mirror((r) => r.deleteDeadline(id));
    return { ok: true };
  },

  /** 어드민: 대표 계정 지정 (모든 사건의 불변기간 경고를 받음) */
  setExecutive(userId: string, on: boolean): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    const target = userById(userId);
    if (!target) return { ok: false, reason: '계정을 찾을 수 없습니다.' };
    if (on && target.role === 'client') return { ok: false, reason: '의뢰인 계정은 대표로 지정할 수 없습니다.' };
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, executive: on || undefined } : u)) }));
    mirror((r) => r.setExecutive(userId, on));
    return { ok: true };
  },

  /** 어드민: 앱 사건에 대륜탑 사건번호를 연결합니다 (대륜탑 기일을 이 번호로 받음). */
  setCaseNo(roomId: string, caseNo: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    const no = caseNo.trim();
    if (no && state.rooms.some((r) => r.id !== roomId && r.caseInfo?.caseNo === no)) return { ok: false, reason: '이미 다른 사건에 연결된 사건번호입니다.' };
    updateRoom(roomId, (r) => (r.caseInfo ? { ...r, caseInfo: { ...r.caseInfo, caseNo: no || undefined } } : r));
    set((s) => (s.deadlineCases ? { deadlineCases: s.deadlineCases.map((c) => (c.roomId === roomId ? { ...c, caseNo: no || undefined } : c)) } : {}));
    mirror((r) => r.setCaseNo(roomId, no));
    return { ok: true };
  },

  // ---- 불변기간 알림 시험 (관리자어드민, '[테스트]' 가짜 사건) ----

  /** 가짜 사건 3개와 불변기간 (D-3, 오늘 만료, 도과, 조치 완료). 예약 작업이 건드리지 않게 사건 알림은 꺼 둡니다. */
  async seedTestLimits(): Promise<RoomCheck> {
    const u = me();
    if (!canManageOpen(u)) return { ok: false, reason: '관리자어드민만 쓸 수 있습니다.' };
    if (state.rooms.some((r) => r.caseInfo?.title.startsWith(TEST_PREFIX)) || state.deadlineCases?.some((c) => c.title.startsWith(TEST_PREFIX))) {
      return { ok: false, reason: '이미 가짜 사건이 있습니다. 먼저 지워 주세요.' };
    }
    if (remote) {
      try {
        await queue;
        await remote.seedTestLimits();
        await refresh();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: reasonOf(e as { message?: string }, '가짜 사건을 만들지 못했습니다.') };
      }
    }
    const lawyer = state.users.find((x) => x.role === 'lawyer');
    const mk = (title: string, field: string, limits: FixedDeadline[]): Room => ({
      id: newId('r'), kind: 'case', mode: 'private', title, memberIds: [u.id, ...(lawyer && lawyer.id !== u.id ? [lawyer.id] : [])], createdBy: u.id, createdAt: nowIso(),
      caseInfo: { title, field, stage: '진행', deadlines: [], documents: [], costs: [], progress: [], limits, limitAlerts: false },
    });
    const lm = (label: string, due: string, handled = false): FixedDeadline => ({ id: newId('lm'), label, due, source: 'manual', ...(handled ? { handledAt: nowIso() } : {}) });
    const rooms = [
      mk(`${TEST_PREFIX} 대여금 청구`, '민사', [lm('항소기간', kstDay(3)), lm('상고기간', kstDay(20), true)]),
      mk(`${TEST_PREFIX} 사기 형사사건`, '형사', [lm('항소기간', kstDay(0))]),
      mk(`${TEST_PREFIX} 영업정지 취소`, '행정', [lm('행정소송 제소기간', kstDay(-1))]),
    ];
    set((s) => ({ rooms: [...s.rooms, ...rooms] }));
    return { ok: true };
  },

  async clearTestLimits(): Promise<RoomCheck> {
    if (!canManageOpen(me())) return { ok: false, reason: '관리자어드민만 쓸 수 있습니다.' };
    if (remote) {
      try {
        await queue;
        await remote.clearTestLimits();
        await refresh();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: reasonOf(e as { message?: string }, '가짜 사건을 지우지 못했습니다.') };
      }
    }
    const gone = state.rooms.filter((r) => r.caseInfo?.title.startsWith(TEST_PREFIX));
    const src = new Set(gone.flatMap((r) => (r.caseInfo!.limits ?? []).map((d) => `deadline:${d.id}`)));
    set((s) => ({ rooms: s.rooms.filter((r) => !gone.includes(r)), posts: s.posts.filter((p) => !p.sourceId || !src.has(p.sourceId)) }));
    return { ok: true };
  },

  /** 시험 알림 지금 보내기: 실제와 같은 문구를 그 사건의 시험 변호사와 누른 사람에게. 만료일 경고는 게시판 글도 올림. */
  async fireTestLimit(deadlineId: string, slot: LimitSlot): Promise<{ ok: true; title: string; body: string; recipients: number } | { ok: false; reason: string }> {
    const u = me();
    if (!canManageOpen(u)) return { ok: false, reason: '관리자어드민만 쓸 수 있습니다.' };
    if (remote) {
      try {
        await queue;
        const r = await remote.fireTestLimit(deadlineId, slot);
        await refresh();
        return { ok: true, ...r };
      } catch (e) {
        return { ok: false, reason: reasonOf(e as { message?: string }, '시험 알림을 보내지 못했습니다.') };
      }
    }
    const room = state.rooms.find((r) => r.caseInfo?.title.startsWith(TEST_PREFIX) && r.caseInfo.limits?.some((d) => d.id === deadlineId));
    const d = room?.caseInfo?.limits?.find((x) => x.id === deadlineId);
    if (!room || !d) return { ok: false, reason: '가짜 사건의 불변기간만 시험할 수 있습니다.' };
    if (slot === 'd0') {
      const post = limitPost(room, d, state.users, nowIso());
      set((s) => ({ posts: [post, ...s.posts.filter((p) => p.sourceId !== post.sourceId)] }));
    }
    const to = new Set([...limitLawyers(room, d, state.users).map((x) => x.id), u.id]);
    return { ok: true, ...limitPushText(slot, d, room.caseInfo!.title), recipients: to.size };
  },

  /** 관리자어드민: 대륜탑 기일 여러 줄 받기 (엑셀 올리기). 서버가 있으면 서버가 처리하고 다시 불러옵니다. */
  async importDaeryuntop(rows: DtHearing[]): Promise<{ ok: true; results: DtResult[] } | { ok: false; reason: string }> {
    if (!canManageOpen(me())) return { ok: false, reason: '관리자어드민만 올릴 수 있습니다.' };
    if (!rows.length) return { ok: false, reason: '올릴 기일이 없습니다.' };
    if (remote) {
      try {
        await queue;
        const results = await remote.importDaeryuntop(rows);
        await refresh();
        return { ok: true, results };
      } catch (e) {
        return { ok: false, reason: reasonOf(e as { message?: string }, '대륜탑 기일을 올리지 못했습니다.') };
      }
    }
    return { ok: true, results: rows.map((h) => ({ id: h.id, ...(h.caseNo ? { caseNo: h.caseNo } : {}), result: ingestLocal(h) })) };
  },

  /** 어드민: 사건별 불변기간 알림 켜기·끄기 */
  setLimitAlerts(roomId: string, on: boolean): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    updateRoom(roomId, (r) => (r.caseInfo ? { ...r, caseInfo: { ...r.caseInfo, limitAlerts: on ? undefined : false } } : r));
    set((s) => (s.deadlineCases ? { deadlineCases: s.deadlineCases.map((c) => (c.roomId === roomId ? { ...c, alertsOn: on } : c)) } : {}));
    mirror((r) => r.setDeadlineAlerts(roomId, on));
    if (on) checkLimitsLocally();
    return { ok: true };
  },

  setCaseStage(roomId: string, stage: CaseInfo['stage']) {
    updateRoom(roomId, (r) => (r.caseInfo ? { ...r, caseInfo: { ...r.caseInfo, stage } } : r));
    mirror((r) => r.setCaseStage(roomId, stage));
    const room = state.rooms.find((r) => r.id === roomId);
    if (room) pushMessage(roomId, BOT_SENDER, 'bot', `진행 알림\n· 사건 단계가 '${stage}'(으)로 바뀌었습니다.\n\n${caseStatusText(room, state.users)}`);
  },

  // ---- 경영 에이전트 ----
  summarizeMeeting(roomId: string, transcript: string): RoomCheck {
    if (!canUseAgents(me())) return { ok: false, reason: '어드민이 허용한 사용자만 쓸 수 있습니다.' };
    pushMessage(roomId, AI_SENDER, 'ai', runCommand(roomId, { kind: 'meeting', arg: transcript }));
    return { ok: true };
  },

  recordOutcome(decisionId: string, outcome: string, verdict: 'good' | 'bad') {
    set((s) => ({ decisions: s.decisions.map((d) => (d.id === decisionId ? { ...d, outcome, verdict } : d)) }));
  },

  askOpinion(roomId: string, proposal: string) {
    const op = opinionFor(state.decisions, proposal);
    pushMessage(roomId, AI_SENDER, 'ai', [`의견: ${op.stance}`, ...op.reasons.map((r) => `· ${r}`)].join('\n'));
    return op;
  },

  refreshTemplate(id: string, rows: DataRow[]) {
    set((s) => ({ templates: s.templates.map((t) => (t.id === id ? refreshTemplate(t, rows, nowIso().slice(0, 10)) : t)) }));
  },

  addTemplate(name: string, chart: ImageTemplate['chart'], unit: string, rows: DataRow[]) {
    const t: ImageTemplate = { id: newId('t'), name, chart, unit, versions: [{ at: nowIso().slice(0, 10), rows }] };
    set((s) => ({ templates: [t, ...s.templates] }));
    return t.id;
  },

  requestProgram(description: string) {
    const ai = getAi();
    const p: ProgramRequest = {
      id: newId('pg'),
      title: titleFrom(description),
      description,
      requestedBy: me().id,
      at: nowIso(),
      status: ai.connected ? '생성 중' : 'AI 연결 대기',
    };
    set((s) => ({ programs: [p, ...s.programs] }));
  },

  // ---- 마케팅 AI ----
  planCommand(command: string) {
    const plan = planFromCommand(newId('pl'), command, state.budgets);
    set((s) => ({ plans: [plan, ...s.plans] }));
    return plan;
  },

  approvePlan(planId: string): RoomCheck {
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan || plan.status !== '승인 대기') return { ok: false, reason: '승인할 수 없는 계획입니다.' };
    if (!canUseAgents(me())) return { ok: false, reason: '어드민이 허용한 사용자만 승인할 수 있습니다.' };
    const budgets = { ...state.budgets };
    const drafts: ContentItem[] = [];
    for (const step of plan.steps) {
      if (step.kind === 'budget') {
        budgets[step.channel] = applyBudget(budgets[step.channel] ?? 0, step.changePct, DEFAULT_GUARDRAILS.dailyCap[step.channel]);
      } else {
        for (let i = 1; i <= step.count; i++) {
          drafts.push({
            id: newId('c'),
            channel: step.channel,
            title: `${step.topic} ${i}`,
            body: `[초안 · ${CHANNEL_LABEL[step.channel]}] ${step.topic} 관련 콘텐츠 ${i}. AI가 연결되면 본문이 자동 작성됩니다.`,
            status: '초안',
          });
        }
      }
    }
    set((s) => ({
      budgets,
      contents: [...drafts, ...s.contents],
      plans: s.plans.map((p) => (p.id === planId ? { ...p, status: '실행됨' } : p)),
    }));
    return { ok: true };
  },

  rejectPlan(planId: string) {
    set((s) => ({ plans: s.plans.map((p) => (p.id === planId ? { ...p, status: '반려' } : p)) }));
  },

  // ---- 익명 게시판 (모든 계정 이용 가능) ----

  createPost(input: { title: string; body: string; field: string; board?: BoardKind; attachments?: Attachment[]; notice?: boolean }): RoomCheck & { postId?: string } {
    const blocked = boardBlocked();
    if (blocked) return blocked;
    const board = input.board ?? 'anon';
    if (!canSeeBoard(me(), board)) return { ok: false, reason: '이 게시판에 글을 쓸 수 없는 계정입니다.' };
    if (!canWriteBoard(me(), board, input.notice)) return { ok: false, reason: '공지는 어드민만 올릴 수 있습니다.' };
    if (!input.title.trim() || !input.body.trim()) return { ok: false, reason: '제목과 내용을 입력해 주세요.' };
    if (needsField(board) && !input.field) return { ok: false, reason: '분야를 골라 주세요.' };
    const attachments = input.attachments ?? [];
    if (attachments.length > MAX_ATTACHMENTS) return { ok: false, reason: `첨부는 ${MAX_ATTACHMENTS}개까지 올릴 수 있습니다.` };
    if (attachments.some((a) => (a.size ?? 0) > 50 * 1024 * 1024)) return { ok: false, reason: '파일은 50MB까지 올릴 수 있습니다.' };
    const post: BoardPost = {
      id: newId('p'), authorId: me().id, field: input.field, title: input.title.trim(), body: input.body.trim(), at: nowIso(), votes: {}, comments: [],
      ...(board !== 'anon' ? { board } : {}), ...(attachments.length ? { attachments } : {}),
      ...(board === 'skyzai' && input.notice ? { notice: true } : {}),
    };
    set((s) => ({ posts: [post, ...s.posts] }));
    mirror((r) => r.createPost(post));
    return { ok: true, postId: post.id };
  },

  /** 게시판 공지 팝업에서 확인한 공지 */
  markNoticesSeen(postIds: string[]) {
    const uid = me().id;
    const cur = state.noticeSeen[uid] ?? [];
    const fresh = postIds.filter((id) => !cur.includes(id));
    if (!fresh.length) return;
    set((s) => ({ noticeSeen: { ...s.noticeSeen, [uid]: [...cur, ...fresh] } }));
    mirror((r) => r.noticesSeen(fresh));
  },

  // ---- 대륜탑 인증코드 ----

  /**
   * 대륜탑이 보낸 인증코드를 본인의 '대륜탑 인증' 봇으로 전달합니다.
   * 서버가 붙으면 대륜탑 웹훅을 받은 서버만 이 동작을 부릅니다 (지금은 관리자어드민 시연용).
   */
  deliverAuthCode(userId: string, code: string, ttlMin = AUTH_TTL_MIN): RoomCheck {
    if (!canManageOpen(me())) return { ok: false, reason: '관리자어드민만 시연할 수 있습니다.' };
    const target = userById(userId);
    if (!target || !canReceiveAuthCodes(target)) return { ok: false, reason: '로펌 구성원 계정에만 보낼 수 있습니다.' };
    const bad = checkAuthCode(code);
    if (bad) return { ok: false, reason: bad };
    const at = nowIso();
    const c: AuthCode = { id: newId('ac'), userId, code, at, expiresAt: new Date(Date.parse(at) + ttlMin * 60_000).toISOString() };
    set((s) => ({ authCodes: [...s.authCodes, c] }));
    return { ok: true };
  },

  readAuthCodes() {
    const uid = me().id;
    if (!state.authCodes.some((c) => c.userId === uid && !c.read)) return;
    set((s) => ({ authCodes: s.authCodes.map((c) => (c.userId === uid ? { ...c, read: true } : c)) }));
    mirror((r) => r.readAuthCodes());
  },

  // ---- 법령개정·최신판례 (매일 오전 7시 자동 게시, 서버 작업) ----

  /** 서버의 매일 7시 작업이 가져온 개정 법령·판례를 게시판에 올립니다. 이미 올린 출처는 건너뜁니다. */
  ingestLawUpdates(updates: LawUpdate[]): number {
    const posts = digestPosts(updates, state.posts, nowIso(), () => newId('p'));
    if (posts.length) set((s) => ({ posts: [...posts, ...s.posts] }));
    return posts.length;
  },

  // ---- 건의사항 ----

  submitSuggestion(body: string): RoomCheck {
    const text = body.trim();
    if (!text) return { ok: false, reason: '건의할 내용을 적어 주세요.' };
    if (text.length > 1000) return { ok: false, reason: '1000자 이내로 적어 주세요.' };
    const sg: Suggestion = { id: newId('sg'), authorId: me().id, body: text, at: nowIso(), status: 'open' };
    set((s) => ({ suggestions: [sg, ...s.suggestions] }));
    mirror((r) => r.submitSuggestion(sg));
    return { ok: true };
  },

  /** 관리자어드민: 처리 상태와 답변 */
  answerSuggestion(id: string, status: SuggestionStatus, answer: string): RoomCheck {
    if (!canSeeSuggestions(me())) return { ok: false, reason: '관리자어드민만 처리할 수 있습니다.' };
    if (!state.suggestions.some((x) => x.id === id)) return { ok: false, reason: '건의사항을 찾을 수 없습니다.' };
    const a = answer.trim();
    set((s) => ({ suggestions: s.suggestions.map((x) => (x.id === id ? { ...x, status, answer: a || undefined, answeredAt: a ? nowIso() : x.answeredAt } : x)) }));
    mirror((r) => r.answerSuggestion(id, status, a));
    return { ok: true };
  },


  commentPost(postId: string, text: string, parentId?: string): RoomCheck {
    const denied = boardDenied(postId);
    if (denied) return denied;
    const blocked = boardBlocked();
    if (blocked) return blocked;
    if (!text.trim()) return { ok: false, reason: '댓글을 입력해 주세요.' };
    const c = { id: newId('pc'), authorId: me().id, parentId, text: text.trim(), at: nowIso(), votes: {} };
    set((s) => ({ posts: s.posts.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, c] } : p)) }));
    mirror((r) => r.comment(c.id, postId, c.text, parentId).then(() => void refresh()));
    return { ok: true };
  },

  votePost(postId: string, v: 1 | -1): RoomCheck {
    const denied = boardDenied(postId);
    if (denied) return denied;
    const blocked = boardBlocked();
    if (blocked) return blocked;
    const uid = me().id;
    set((s) => ({ posts: s.posts.map((p) => (p.id === postId ? { ...p, votes: toggleVote(p.votes, uid, v) } : p)) }));
    mirror((r) => r.votePost(postId, v));
    return { ok: true };
  },

  voteComment(postId: string, commentId: string, v: 1 | -1): RoomCheck {
    const denied = boardDenied(postId);
    if (denied) return denied;
    const blocked = boardBlocked();
    if (blocked) return blocked;
    const uid = me().id;
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, votes: toggleVote(c.votes, uid, v) } : c)) } : p,
      ),
    }));
    mirror((r) => r.voteComment(commentId, v));
    return { ok: true };
  },

  /** 게시판 글·댓글 작성자에게 익명 쪽지. 같은 글에서 같은 상대와의 쪽지는 이어서 씁니다. */
  openNote(postId: string, toUserId: string): RoomCheck & { noteId?: string } {
    const denied = boardDenied(postId);
    if (denied) return denied;
    const uid = me().id;
    if (toUserId === uid) return { ok: false, reason: '내 글에는 쪽지를 보낼 수 없습니다.' };
    if (toUserId === LAW_BOT || toUserId === LIMIT_BOT) return { ok: false, reason: '자동 글에는 쪽지를 보낼 수 없습니다.' };
    const found = state.notes.find((n) => n.postId === postId && n.memberIds.includes(uid) && n.memberIds.includes(toUserId));
    if (found) return { ok: true, noteId: found.id };
    const note: NoteThread = { id: newId('n'), postId, memberIds: [uid, toUserId], messages: [], readAt: {} };
    set((s) => ({ notes: [note, ...s.notes] }));
    // 서버에는 상대를 id 대신 글(글쓴이) 또는 그 사람의 댓글로 알려 줍니다 (익명 게시판에서 id가 드러나지 않도록).
    const post = state.posts.find((p) => p.id === postId);
    const viaComment = post && post.authorId !== toUserId ? post.comments.find((c) => c.authorId === toUserId)?.id ?? null : null;
    mirror((r) => r.openNote(note.id, postId, viaComment).then(() => void refresh()));
    return { ok: true, noteId: note.id };
  },

  sendNote(noteId: string, text: string): RoomCheck {
    const blocked = boardBlocked();
    if (blocked) return blocked;
    if (!text.trim()) return { ok: false, reason: '쪽지 내용을 입력해 주세요.' };
    const uid = me().id;
    const at = nowIso();
    const msg = { id: newId('nm'), senderId: uid, text: text.trim(), at };
    set((s) => ({ notes: s.notes.map((n) => (n.id === noteId ? { ...n, messages: [...n.messages, msg], readAt: { ...n.readAt, [uid]: at } } : n)) }));
    mirror((r) => r.sendNote(msg.id, noteId, msg.text));
    return { ok: true };
  },

  readNote(noteId: string) {
    const uid = me().id;
    const n = state.notes.find((x) => x.id === noteId);
    const last = n?.messages.at(-1)?.at;
    if (!n || !last || (n.readAt[uid] ?? '') >= last) return;
    set((s) => ({ notes: s.notes.map((x) => (x.id === noteId ? { ...x, readAt: { ...x.readAt, [uid]: last } } : x)) }));
    mirror((r) => r.readNote(noteId));
  },

  /** 글(commentId 없음) 또는 댓글 신고. 같은 대상은 한 번만 신고할 수 있습니다. */
  report(postId: string, reason: string, commentId?: string): RoomCheck {
    const denied = boardDenied(postId);
    if (denied) return denied;
    const uid = me().id;
    const target = reportTarget({ id: '', postId, commentId, reporterId: uid, reason, at: '', status: 'open' }, state.posts);
    if (!target) return { ok: false, reason: '신고할 글을 찾을 수 없습니다.' };
    if (target.authorId === uid) return { ok: false, reason: '내 글은 신고할 수 없습니다.' };
    if (!reason) return { ok: false, reason: '신고 사유를 골라 주세요.' };
    if (state.reports.some((r) => r.postId === postId && r.commentId === commentId && r.reporterId === uid)) {
      return { ok: false, reason: '이미 신고했습니다.' };
    }
    const r: BoardReport = { id: newId('rp'), postId, commentId, reporterId: uid, reason, at: nowIso(), status: 'open' };
    set((s) => ({ reports: [r, ...s.reports] }));
    mirror((x) => x.report(r.id, postId, reason, commentId));
    return { ok: true };
  },

  // ---- 어드민: 신고 처리 ----

  deletePost(postId: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 삭제할 수 있습니다.' };
    set((s) => ({
      posts: s.posts.filter((p) => p.id !== postId),
      reports: closeReports(s.reports, (r) => r.postId === postId, '글 삭제'),
    }));
    mirror((r) => r.deletePost(postId));
    return { ok: true };
  },

  /** 답글 흐름이 끊기지 않도록 댓글은 '삭제된 댓글'로 남깁니다. */
  deleteComment(postId: string, commentId: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 삭제할 수 있습니다.' };
    set((s) => ({
      posts: s.posts.map((p) => (p.id === postId ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, text: '', deleted: true } : c)) } : p)),
      reports: closeReports(s.reports, (r) => r.postId === postId && r.commentId === commentId, '댓글 삭제'),
    }));
    mirror((r) => r.deleteComment(commentId));
    return { ok: true };
  },

  restrictUser(userId: string, hours: number): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 제한할 수 있습니다.' };
    if (userId === me().id) return { ok: false, reason: '자기 계정은 제한할 수 없습니다.' };
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    // 서버에는 대상을 그 사람의 글·댓글로 알려 줍니다.
    let target: { postId: string; commentId: string | null } | undefined;
    for (const p of state.posts) {
      if (p.authorId === userId) target = { postId: p.id, commentId: null };
      const c = p.comments.find((x) => x.authorId === userId);
      if (!target && c) target = { postId: p.id, commentId: c.id };
      if (target) break;
    }
    if (remote && !target) return { ok: false, reason: '제한할 사람의 글을 찾을 수 없습니다.' };
    set((s) => ({ boardBans: { ...s.boardBans, [userId]: until } }));
    if (target) mirror((r) => r.restrict(target.postId, target.commentId, hours));
    return { ok: true };
  },

  liftRestriction(userId: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 해제할 수 있습니다.' };
    set((s) => {
      const boardBans = { ...s.boardBans };
      delete boardBans[userId];
      return { boardBans };
    });
    mirror((r) => r.liftRestriction(userId));
    return { ok: true };
  },

  /** 신고 처리 기록: 이용 제한을 걸었거나, 문제없다고 기각 */
  closeReport(reportId: string, status: 'resolved' | 'dismissed', resolution: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 처리할 수 있습니다.' };
    set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status, resolution } : r)) }));
    mirror((r) => r.closeReport(reportId, status, resolution));
    return { ok: true };
  },

  approveContent(id: string) {
    set((s) => ({ contents: s.contents.map((c) => (c.id === id ? { ...c, status: '발행 대기' } : c)) }));
  },
};
