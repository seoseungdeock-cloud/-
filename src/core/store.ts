// 앱 상태 저장소. 서버가 붙기 전까지는 기기 메모리에만 있고 앱을 다시 열면 처음 상태로 돌아갑니다.
// 서버 연결 시 이 파일의 동작들을 API 호출로 바꾸면 화면 코드는 그대로 둘 수 있습니다.
import { getAi } from './ai';
import { AI_HELP, needsAgentAccess, parseAiCommand, type AiCommand } from './commands';
import { checkCompliance } from './compliance';
import { similarity } from './text';
import type { DecisionRecord } from './knowledge';
import { opinionFor } from './knowledge';
import { titleFrom, type ProgramRequest } from './builder';
import { newId, nowIso } from './ids';
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
import { formatUntil, reportTarget, restrictedUntil, toggleVote } from './board';
import { displayName, parseMentions, type Reads } from './messenger';
import { findLawyer } from './offices';
import { procedureReply } from './procedures';
import { aiAnswerLevel, canCreateRoom, canUseAgents, type RoomCheck } from './rooms';
import { latest, parseRows, refreshTemplate, type DataRow, type ImageTemplate } from './templates';
import {
  AI_SENDER,
  BOT_SENDER,
  SYSTEM_SENDER,
  type Account,
  type BoardPost,
  type NoteThread,
  type BoardReport,
  type CaseInfo,
  type Message,
  type NotifyLevel,
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
};

const T0 = '2026-10-13T09:00:00.000Z';
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export function initialState(): State {
  const users: User[] = [
    { id: 'u_admin', nickname: '승덕', role: 'admin', firm: '대륜', agentAccess: true, membership: 'basic', title: 'Admin', dept: '경영지원본부', branch: '본사', phone: '010-0000-0001', email: 'admin@example.com', joinedAt: '2026-06-15' },
    { id: 'u_staff', nickname: '사무국 직원', role: 'staff', officeId: 'of_seoul', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Staff', dept: '부산총괄본부', branch: '부산총괄본부', phone: '010-0000-0002', email: 'staff@example.com', joinedAt: '2025-03-02' },
    { id: 'u_lawyer', nickname: '샘플 변호사 A', role: 'lawyer', officeId: 'of_seoul', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Partner Attorney', dept: '부산총괄본부', branch: '부산총괄본부', phone: '010-0000-0003', email: 'lawyer@example.com', joinedAt: '2020-09-01' },
    { id: 'u_client', nickname: '하늘', role: 'client', agentAccess: false, membership: 'basic' },
    // 조직도 확인용 샘플 구성원 (로그인 계정 없음)
    { id: 'u_l2', nickname: '샘플 변호사 B', role: 'lawyer', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Junior Associate Attorney', dept: '실무수습변호사', branch: '서울강남', phone: '010-0000-0004', email: 'lawyer-b@example.com', joinedAt: '2026-06-15' },
    { id: 'u_l3', nickname: '샘플 변호사 C', role: 'lawyer', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Junior Associate Attorney', dept: '실무수습변호사', branch: '군산', phone: '010-0000-0005', email: 'lawyer-c@example.com', joinedAt: '2026-06-15' },
    { id: 'u_m1', nickname: '샘플 매니저', role: 'staff', firm: '대륜', agentAccess: false, membership: 'basic', title: 'Manager', dept: '부산총괄본부', branch: '부산총괄본부', phone: '010-0000-0006', email: 'manager@example.com', joinedAt: '2024-01-08' },
  ];
  // 개발용 계정 (서버 연결 시 백오피스에서 실제 계정으로 교체)
  const accounts: Account[] = [
    { userId: 'u_admin', loginId: 'admin', password: 'admin1234', active: true, createdAt: T0 },
    { userId: 'u_staff', loginId: 'staff', password: 'staff1234', active: true, createdAt: T0 },
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
      notices: [{ id: 'nt1', messageId: 'mt1', text: '[리마인드 공지] 상담 변호사는 내방 안내 전화를 상담 전날까지 꼭 해 주세요.', by: 'u_m1', at: ago(5) }],
    },
  ];
  const messages: Message[] = [
    { id: 'm1', roomId: 'r_office', senderId: SYSTEM_SENDER, kind: 'system', text: 'AI 참여방입니다. @AI 로 부르면 AI가 답합니다.', at: T0 },
    { id: 'm2', roomId: 'r_office', senderId: 'u_staff', kind: 'text', text: '내일 오전 기일 서류 준비 완료했습니다.', at: T0 },
    { id: 'm3', roomId: 'r_direct', senderId: SYSTEM_SENDER, kind: 'system', text: '사건수행방입니다. 참여자끼리만 대화하고 AI는 참여하지 않습니다.', at: T0 },
    { id: 'mt1', roomId: 'r_team', senderId: 'u_m1', kind: 'text', text: '[리마인드 공지] 상담 변호사는 내방 안내 전화를 상담 전날까지 꼭 해 주세요.', at: ago(5) },
    { id: 'mt2', roomId: 'r_team', senderId: 'u_lawyer', kind: 'text', text: '@샘플 매니저 @사무국 직원 내일 상담 일정 공유 부탁드립니다.', at: ago(3), mentions: ['u_m1', 'u_staff'], reactions: { u_m1: '👍' } },
    { id: 'mt3', roomId: 'r_team', senderId: 'u_staff', kind: 'text', text: '네, 오전 중에 올리겠습니다.', at: ago(2.9), replyTo: 'mt2' },
    { id: 'mt4', roomId: 'r_team', senderId: 'u_m1', kind: 'text', text: '상담 일정표 링크입니다 https://example.com/schedule', at: ago(1) },
    { id: 'mt5', roomId: 'r_team', senderId: 'u_l2', kind: 'text', text: '@승덕 대표님 확인 부탁드립니다.', at: ago(0.5), mentions: ['u_admin'] },
  ];
  return {
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
    reports: [{ id: 'rp1', postId: 'p2', reporterId: 'u_lawyer', reason: '개인정보 노출', at: ago(1), status: 'open' }],
    boardBans: {},
    reads: { r_team: { u_lawyer: ago(2.95), u_staff: ago(2.9), u_m1: ago(1), u_l2: ago(0.5), u_admin: ago(4) } },
    favorites: { u_lawyer: ['u_staff'], u_admin: ['u_lawyer'] },
  };
}

// ---- 구독 ----
let state = initialState();
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
  state = initialState();
  listeners.forEach((l) => l());
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

/** 게시판 이용 제한 중이면 거절 사유 */
function boardBlocked(): RoomCheck | undefined {
  const until = restrictedUntil(state.boardBans, me().id);
  return until ? { ok: false, reason: `게시판 이용이 제한되었습니다. (${formatUntil(until)}까지)` } : undefined;
}

function closeReports(reports: BoardReport[], match: (r: BoardReport) => boolean, resolution: string): BoardReport[] {
  return reports.map((r) => (r.status === 'open' && match(r) ? { ...r, status: 'resolved' as const, resolution } : r));
}

const PRIVATE_CASE_NOTE = '사건수행방입니다. AI는 대화에 참여하지 않고, 사건 진행·배당 알림과 절차 안내만 전해 드립니다.';

function userById(id: string) {
  return state.users.find((u) => u.id === id);
}

function pushMessage(roomId: string, senderId: string, kind: Message['kind'], text: string, extra: Partial<Message> = {}) {
  const msg: Message = { id: newId('m'), roomId, senderId, kind, text, at: nowIso(), ...extra };
  set((s) => ({ messages: [...s.messages, msg] }));
  if (senderId !== SYSTEM_SENDER && senderId !== AI_SENDER && senderId !== BOT_SENDER) markReadAt(roomId, senderId, msg.at);
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

  logout() {
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
    return { ok: true };
  },

  resetPassword(userId: string, password: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    if (password.length < 8) return { ok: false, reason: '비밀번호는 8자 이상이어야 합니다.' };
    set((s) => ({ accounts: s.accounts.map((a) => (a.userId === userId ? { ...a, password } : a)) }));
    return { ok: true };
  },

  setAccountActive(userId: string, active: boolean): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    if (userId === state.currentUserId) return { ok: false, reason: '내 계정은 중지할 수 없습니다.' };
    set((s) => ({ accounts: s.accounts.map((a) => (a.userId === userId ? { ...a, active } : a)) }));
    return { ok: true };
  },

  setRole(userId: string, role: Role): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 바꿀 수 있습니다.' };
    if (userId === state.currentUserId) return { ok: false, reason: '내 역할은 바꿀 수 없습니다.' };
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, role, agentAccess: role === 'client' ? false : u.agentAccess } : u)) }));
    return { ok: true };
  },

  setAgentAccess(userId: string, allowed: boolean): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 권한을 바꿀 수 있습니다.' };
    const target = userById(userId);
    if (!target || target.role === 'client') return { ok: false, reason: '로펌 구성원에게만 허용할 수 있습니다.' };
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, agentAccess: allowed } : u)) }));
    return { ok: true };
  },

  setMembership(level: User['membership']) {
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
      createdAt: nowIso(),
    };
    set((s) => ({ rooms: [room, ...s.rooms] }));
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
      pushMessage(roomId, SYSTEM_SENDER, 'system', "사건수행방에서는 AI가 대화에 참여하지 않습니다. '@AI 진행 상황', '@AI 배당 정보'로 사건 정보만 받을 수 있습니다.");
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
    const recent = state.messages.filter((m) => m.roomId === roomId).slice(-20).map((m) => `${m.senderId}: ${m.text}`).join('\n');
    const system =
      level === 'lawyer-assist'
        ? '변호사가 함께 있는 사건방입니다. 담당 변호사를 보조하는 의견을 냅니다.'
        : level === 'general-info'
          ? '변호사가 없는 방입니다. 개별 사건에 대한 법률 판단은 하지 말고 일반적인 법률 정보만 안내합니다.'
          : '로펌 내부 업무방입니다.';
    let reply = await getAi().complete({ task: 'room-reply', system, input: `${recent}\n\n요청: ${text}` });
    if (level === 'general-info') reply += '\n\n※ 일반 법률 정보이며 개별 사건의 법률 자문이 아닙니다. 변호사 상담을 받아 보세요.';
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
    pushMessage(room.id, SYSTEM_SENDER, 'system', `${lawyer.name} 변호사에게 수임을 요청했습니다. 이 사건방에서 진행 상황을 함께 봅니다.`);
    pushMessage(room.id, SYSTEM_SENDER, 'system', PRIVATE_CASE_NOTE);
    pushMessage(room.id, BOT_SENDER, 'bot', assignmentText(room, state.users));
    if (summary.trim()) pushMessage(room.id, client.id, 'text', summary.trim());
    return { ok: true, roomId: room.id };
  },

  // ---- 메신저 (웍스식 대화 기능) ----

  markRead(roomId: string) {
    const last = [...state.messages].reverse().find((m) => m.roomId === roomId);
    if (last) markReadAt(roomId, me().id, last.at);
  },

  /** 같은 이모지를 다시 누르면 취소 */
  react(messageId: string, emoji: string) {
    const uid = me().id;
    updateMessage(messageId, (m) => {
      const reactions = { ...m.reactions };
      if (reactions[uid] === emoji) delete reactions[uid];
      else reactions[uid] = emoji;
      return { ...m, reactions };
    });
  },

  /** 내가 보낸 메시지를 모두에게서 회수 */
  recall(messageId: string): RoomCheck {
    const m = state.messages.find((x) => x.id === messageId);
    if (!m || m.senderId !== me().id) return { ok: false, reason: '내가 보낸 메시지만 회수할 수 있습니다.' };
    updateMessage(messageId, (x) => ({ ...x, text: '', recalled: true, reactions: {}, mentions: [] }));
    return { ok: true };
  },

  /** 나에게서만 삭제 */
  deleteForMe(messageId: string) {
    const uid = me().id;
    updateMessage(messageId, (m) => ({ ...m, deletedFor: [...(m.deletedFor ?? []), uid] }));
  },

  forward(messageId: string, toRoomId: string): RoomCheck {
    const m = state.messages.find((x) => x.id === messageId);
    const to = state.rooms.find((r) => r.id === toRoomId);
    if (!m || m.recalled) return { ok: false, reason: '전달할 메시지를 찾을 수 없습니다.' };
    if (!to || !to.memberIds.includes(me().id)) return { ok: false, reason: '참여 중인 방으로만 전달할 수 있습니다.' };
    const origin = m.forwardOf ?? { senderId: m.senderId, text: m.text };
    pushMessage(toRoomId, me().id, 'text', origin.text, { forwardOf: origin });
    return { ok: true };
  },

  setNotice(messageId: string): RoomCheck {
    const m = state.messages.find((x) => x.id === messageId);
    if (!m || m.recalled || !m.text) return { ok: false, reason: '공지로 올릴 수 없는 메시지입니다.' };
    const notice = { id: newId('nt'), messageId, text: m.text, by: me().id, at: nowIso() };
    updateRoom(m.roomId, (r) => ({ ...r, notices: [notice, ...(r.notices ?? []).filter((n) => n.messageId !== messageId)].slice(0, 5), noticeHiddenBy: [] }));
    pushMessage(m.roomId, SYSTEM_SENDER, 'system', `${me().nickname}님이 공지를 등록했습니다.`);
    return { ok: true };
  },

  removeNotice(roomId: string, noticeId: string) {
    updateRoom(roomId, (r) => ({ ...r, notices: (r.notices ?? []).filter((n) => n.id !== noticeId) }));
  },

  /** 공지 '다시 보지 않기' */
  hideNotices(roomId: string) {
    const uid = me().id;
    updateRoom(roomId, (r) => ({ ...r, noticeHiddenBy: [...(r.noticeHiddenBy ?? []), uid] }));
  },

  togglePin(roomId: string) {
    const uid = me().id;
    updateRoom(roomId, (r) => ({ ...r, pinnedBy: r.pinnedBy?.includes(uid) ? r.pinnedBy.filter((x) => x !== uid) : [...(r.pinnedBy ?? []), uid] }));
  },

  setNotify(roomId: string, level: NotifyLevel) {
    const uid = me().id;
    updateRoom(roomId, (r) => ({ ...r, notify: { ...r.notify, [uid]: level } }));
  },

  /** 목록에서 숨기기. 새 메시지가 오면 다시 보입니다. */
  hideRoom(roomId: string) {
    const uid = me().id;
    updateRoom(roomId, (r) => ({ ...r, hiddenAt: { ...r.hiddenAt, [uid]: nowIso() } }));
  },

  leaveRoom(roomId: string): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    const u = me();
    if (!room || !room.memberIds.includes(u.id)) return { ok: false, reason: '참여 중인 방이 아닙니다.' };
    if (room.kind === 'case' || room.kind === 'consult') return { ok: false, reason: '상담·사건방은 나갈 수 없습니다.' };
    updateRoom(roomId, (r) => ({ ...r, memberIds: r.memberIds.filter((x) => x !== u.id), pinnedBy: r.pinnedBy?.filter((x) => x !== u.id) }));
    pushMessage(roomId, SYSTEM_SENDER, 'system', `${u.nickname}님이 나갔습니다.`);
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

  toggleFavorite(userId: string) {
    const uid = me().id;
    const cur = state.favorites[uid] ?? [];
    set((s) => ({ favorites: { ...s.favorites, [uid]: cur.includes(userId) ? cur.filter((x) => x !== userId) : [...cur, userId] } }));
  },

  shareContact(roomId: string, contactId: string): RoomCheck {
    const c = userById(contactId);
    if (!c) return { ok: false, reason: '연락처를 찾을 수 없습니다.' };
    pushMessage(roomId, me().id, 'contact', displayName(c), { contactId });
    return { ok: true };
  },

  /** 주소록에서 1:1 대화 열기 (있으면 기존 방) */
  openDirect(otherId: string): string {
    const my = me().id;
    const existing = state.rooms.find((r) => r.kind === 'direct' && r.memberIds.length === 2 && r.memberIds.includes(my) && r.memberIds.includes(otherId));
    if (existing) {
      if (existing.hiddenAt?.[my]) updateRoom(existing.id, (r) => ({ ...r, hiddenAt: { ...r.hiddenAt, [my]: '' } }));
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
    pushMessage(roomId, SYSTEM_SENDER, 'system', '사건방으로 전환되었습니다. 진행 상황·기일·서류가 이 방에서 공유됩니다.');
    const promoted = state.rooms.find((r) => r.id === roomId);
    if (promoted) pushMessage(roomId, BOT_SENDER, 'bot', assignmentText(promoted, state.users));
    return { ok: true };
  },

  addCaseEntry(roomId: string, entry: { type: 'deadline' | 'document' | 'cost' | 'progress'; label: string; date?: string; amount?: number }) {
    const id = newId('ce');
    updateRoom(roomId, (r) => {
      if (!r.caseInfo) return r;
      const c = { ...r.caseInfo };
      if (entry.type === 'deadline') c.deadlines = [...c.deadlines, { id, label: entry.label, date: entry.date ?? '' }];
      if (entry.type === 'document') c.documents = [...c.documents, { id, name: entry.label, addedAt: nowIso() }];
      if (entry.type === 'cost') c.costs = [...c.costs, { id, label: entry.label, amount: entry.amount ?? 0 }];
      if (entry.type === 'progress') c.progress = [...c.progress, { id, at: nowIso(), note: entry.label }];
      return { ...r, caseInfo: c };
    });
    if (entry.type === 'deadline') pushMessage(roomId, BOT_SENDER, 'bot', `기일 알림\n· ${entry.label}${entry.date ? ` (${entry.date})` : ''}`);
    else if (entry.type === 'progress') pushMessage(roomId, BOT_SENDER, 'bot', `진행 알림\n· ${entry.label}`);
    else pushMessage(roomId, SYSTEM_SENDER, 'system', `${entry.type === 'document' ? '서류' : '비용'} 추가: ${entry.label}`);
  },

  setCaseStage(roomId: string, stage: CaseInfo['stage']) {
    updateRoom(roomId, (r) => (r.caseInfo ? { ...r, caseInfo: { ...r.caseInfo, stage } } : r));
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

  createPost(input: { title: string; body: string; field: string }): RoomCheck & { postId?: string } {
    const blocked = boardBlocked();
    if (blocked) return blocked;
    if (!input.title.trim() || !input.body.trim()) return { ok: false, reason: '제목과 내용을 입력해 주세요.' };
    if (!input.field) return { ok: false, reason: '분야를 골라 주세요.' };
    const post: BoardPost = { id: newId('p'), authorId: me().id, field: input.field, title: input.title.trim(), body: input.body.trim(), at: nowIso(), votes: {}, comments: [] };
    set((s) => ({ posts: [post, ...s.posts] }));
    return { ok: true, postId: post.id };
  },

  commentPost(postId: string, text: string, parentId?: string): RoomCheck {
    const blocked = boardBlocked();
    if (blocked) return blocked;
    if (!text.trim()) return { ok: false, reason: '댓글을 입력해 주세요.' };
    const c = { id: newId('pc'), authorId: me().id, parentId, text: text.trim(), at: nowIso(), votes: {} };
    set((s) => ({ posts: s.posts.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, c] } : p)) }));
    return { ok: true };
  },

  votePost(postId: string, v: 1 | -1): RoomCheck {
    const blocked = boardBlocked();
    if (blocked) return blocked;
    const uid = me().id;
    set((s) => ({ posts: s.posts.map((p) => (p.id === postId ? { ...p, votes: toggleVote(p.votes, uid, v) } : p)) }));
    return { ok: true };
  },

  voteComment(postId: string, commentId: string, v: 1 | -1): RoomCheck {
    const blocked = boardBlocked();
    if (blocked) return blocked;
    const uid = me().id;
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, votes: toggleVote(c.votes, uid, v) } : c)) } : p,
      ),
    }));
    return { ok: true };
  },

  /** 게시판 글·댓글 작성자에게 익명 쪽지. 같은 글에서 같은 상대와의 쪽지는 이어서 씁니다. */
  openNote(postId: string, toUserId: string): RoomCheck & { noteId?: string } {
    const uid = me().id;
    if (toUserId === uid) return { ok: false, reason: '내 글에는 쪽지를 보낼 수 없습니다.' };
    const found = state.notes.find((n) => n.postId === postId && n.memberIds.includes(uid) && n.memberIds.includes(toUserId));
    if (found) return { ok: true, noteId: found.id };
    const note: NoteThread = { id: newId('n'), postId, memberIds: [uid, toUserId], messages: [], readAt: {} };
    set((s) => ({ notes: [note, ...s.notes] }));
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
    return { ok: true };
  },

  readNote(noteId: string) {
    const uid = me().id;
    const n = state.notes.find((x) => x.id === noteId);
    const last = n?.messages.at(-1)?.at;
    if (!n || !last || (n.readAt[uid] ?? '') >= last) return;
    set((s) => ({ notes: s.notes.map((x) => (x.id === noteId ? { ...x, readAt: { ...x.readAt, [uid]: last } } : x)) }));
  },

  /** 글(commentId 없음) 또는 댓글 신고. 같은 대상은 한 번만 신고할 수 있습니다. */
  report(postId: string, reason: string, commentId?: string): RoomCheck {
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
    return { ok: true };
  },

  // ---- 어드민: 신고 처리 ----

  deletePost(postId: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 삭제할 수 있습니다.' };
    set((s) => ({
      posts: s.posts.filter((p) => p.id !== postId),
      reports: closeReports(s.reports, (r) => r.postId === postId, '글 삭제'),
    }));
    return { ok: true };
  },

  /** 답글 흐름이 끊기지 않도록 댓글은 '삭제된 댓글'로 남깁니다. */
  deleteComment(postId: string, commentId: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 삭제할 수 있습니다.' };
    set((s) => ({
      posts: s.posts.map((p) => (p.id === postId ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, text: '', deleted: true } : c)) } : p)),
      reports: closeReports(s.reports, (r) => r.postId === postId && r.commentId === commentId, '댓글 삭제'),
    }));
    return { ok: true };
  },

  restrictUser(userId: string, hours: number): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 제한할 수 있습니다.' };
    if (userId === me().id) return { ok: false, reason: '자기 계정은 제한할 수 없습니다.' };
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    set((s) => ({ boardBans: { ...s.boardBans, [userId]: until } }));
    return { ok: true };
  },

  liftRestriction(userId: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 해제할 수 있습니다.' };
    set((s) => {
      const boardBans = { ...s.boardBans };
      delete boardBans[userId];
      return { boardBans };
    });
    return { ok: true };
  },

  /** 신고 처리 기록: 이용 제한을 걸었거나, 문제없다고 기각 */
  closeReport(reportId: string, status: 'resolved' | 'dismissed', resolution: string): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 처리할 수 있습니다.' };
    set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status, resolution } : r)) }));
    return { ok: true };
  },

  approveContent(id: string) {
    set((s) => ({ contents: s.contents.map((c) => (c.id === id ? { ...c, status: '발행 대기' } : c)) }));
  },
};
