// 앱 상태 저장소. 서버가 붙기 전까지는 기기 메모리에만 있고 앱을 다시 열면 처음 상태로 돌아갑니다.
// 서버 연결 시 이 파일의 동작들을 API 호출로 바꾸면 화면 코드는 그대로 둘 수 있습니다.
import { getAi } from './ai';
import type { DecisionRecord } from './knowledge';
import { opinionFor } from './knowledge';
import { titleFrom, type ProgramRequest } from './builder';
import { AI_DISCLOSURE } from './compliance';
import { newId, nowIso } from './ids';
import {
  applyBudget,
  CHANNEL_LABEL,
  DEFAULT_GUARDRAILS,
  planFromCommand,
  type Channel,
  type ContentItem,
  type Performance,
  type Plan,
} from './marketing';
import { summarizeMeeting, type MeetingNotes } from './meeting';
import { findLawyer } from './offices';
import { aiAnswerLevel, canCreateRoom, canUseAgents, type RoomCheck } from './rooms';
import { refreshTemplate, type DataRow, type ImageTemplate } from './templates';
import {
  AI_SENDER,
  SYSTEM_SENDER,
  type CaseInfo,
  type Message,
  type Room,
  type RoomKind,
  type RoomMode,
  type User,
} from './types';

export type State = {
  currentUserId: string;
  users: User[];
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
};

const T0 = '2026-10-13T09:00:00.000Z';

export function initialState(): State {
  const users: User[] = [
    { id: 'u_admin', nickname: '승덕', role: 'admin', identityVerified: true, adultVerified: true, agentAccess: true, membership: 'basic' },
    { id: 'u_staff', nickname: '사무국 직원', role: 'staff', officeId: 'of_seoul', identityVerified: true, adultVerified: true, agentAccess: false, membership: 'basic' },
    { id: 'u_lawyer', nickname: '샘플 변호사 A', role: 'lawyer', officeId: 'of_seoul', identityVerified: true, adultVerified: true, agentAccess: false, membership: 'basic' },
    { id: 'u_client', nickname: '하늘', role: 'client', identityVerified: false, adultVerified: false, agentAccess: false, membership: 'basic' },
  ];
  const rooms: Room[] = [
    { id: 'r_office', kind: 'office', mode: 'ai', title: '서울 사무소', memberIds: ['u_admin', 'u_staff', 'u_lawyer'], createdBy: 'u_admin', createdAt: T0, officeId: 'of_seoul' },
    { id: 'r_direct', kind: 'direct', mode: 'e2ee', title: '사무국 직원', memberIds: ['u_admin', 'u_staff'], createdBy: 'u_admin', createdAt: T0 },
    { id: 'r_meeting', kind: 'meeting', mode: 'ai', title: '주간 경영회의', memberIds: ['u_admin', 'u_lawyer'], createdBy: 'u_admin', createdAt: T0 },
    { id: 'r_marketing', kind: 'marketing', mode: 'ai', title: '마케팅 작업방', memberIds: ['u_admin'], createdBy: 'u_admin', createdAt: T0 },
  ];
  const messages: Message[] = [
    { id: 'm1', roomId: 'r_office', senderId: SYSTEM_SENDER, kind: 'system', text: 'AI 참여방입니다. @AI 로 부르면 AI가 답합니다.', at: T0 },
    { id: 'm2', roomId: 'r_office', senderId: 'u_staff', kind: 'text', text: '내일 오전 기일 서류 준비 완료했습니다.', at: T0 },
    { id: 'm3', roomId: 'r_direct', senderId: SYSTEM_SENDER, kind: 'system', text: '종단간 암호화방입니다. 대화 내용은 참여자 기기에서만 열립니다.', at: T0 },
  ];
  return {
    currentUserId: 'u_admin',
    users,
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

export function me(s: State = state): User {
  return s.users.find((u) => u.id === s.currentUserId)!;
}

function userById(id: string) {
  return state.users.find((u) => u.id === id);
}

function pushMessage(roomId: string, senderId: string, kind: Message['kind'], text: string) {
  const msg: Message = { id: newId('m'), roomId, senderId, kind, text, at: nowIso() };
  set((s) => ({ messages: [...s.messages, msg] }));
  return msg;
}

function updateRoom(roomId: string, fn: (r: Room) => Room) {
  set((s) => ({ rooms: s.rooms.map((r) => (r.id === roomId ? fn(r) : r)) }));
}

// ---- 사용자 ----
export const actions = {
  switchUser(id: string) {
    set({ currentUserId: id });
  },

  /** 본인확인·성인인증. 지금은 연결 전이라 버튼으로 완료 처리합니다(PASS 등은 요청 시 연결). */
  verify(kind: 'identity' | 'adult') {
    const id = state.currentUserId;
    set((s) => ({
      users: s.users.map((u) =>
        u.id === id ? { ...u, ...(kind === 'identity' ? { identityVerified: true, adultVerified: true } : { adultVerified: true }) } : u,
      ),
    }));
  },

  setAgentAccess(userId: string, allowed: boolean): RoomCheck {
    if (me().role !== 'admin') return { ok: false, reason: '어드민만 권한을 바꿀 수 있습니다.' };
    const target = userById(userId);
    if (!target || target.role === 'client') return { ok: false, reason: '로펌 구성원에게만 허용할 수 있습니다.' };
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, agentAccess: allowed } : u)) }));
    return { ok: true };
  },

  setMembership(level: User['membership']) {
    const id = state.currentUserId;
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
      room.mode === 'e2ee'
        ? '종단간 암호화방이 만들어졌습니다. 운영자와 AI 모두 내용을 읽을 수 없습니다.'
        : 'AI 참여방이 만들어졌습니다. AI가 대화를 읽고 @AI 로 부르면 답합니다.',
    );
    return { ok: true, roomId: room.id };
  },

  async sendMessage(roomId: string, text: string) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || !text.trim()) return;
    pushMessage(roomId, state.currentUserId, 'text', text.trim());
    if (!/@ai\b|@AI/i.test(text)) return;
    const members = room.memberIds.map(userById).filter((u): u is User => !!u);
    const level = aiAnswerLevel(room, members);
    if (level === 'none') {
      pushMessage(roomId, SYSTEM_SENDER, 'system', '암호화방이라 AI가 참여할 수 없습니다. AI가 필요하면 AI 참여방을 따로 만들어 주세요.');
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
  requestConsult(lawyerId: string, summary: string, mode: RoomMode): RoomCheck & { roomId?: string } {
    const lawyer = findLawyer(lawyerId);
    if (!lawyer) return { ok: false, reason: '변호사 정보를 찾을 수 없습니다.' };
    const client = me();
    const lawyerUser = state.lawyerAccounts[lawyerId];
    const room: Room = {
      id: newId('r'),
      kind: 'consult',
      mode,
      title: `${lawyer.name} 상담`,
      memberIds: [client.id, ...(lawyerUser ? [lawyerUser] : [])],
      createdBy: client.id,
      createdAt: nowIso(),
      officeId: lawyer.office.id,
    };
    set((s) => ({ rooms: [room, ...s.rooms] }));
    pushMessage(room.id, SYSTEM_SENDER, 'system', `상담 신청이 접수되었습니다. ${lawyer.name} 변호사가 수락하면 대화가 시작됩니다.`);
    if (summary.trim()) pushMessage(room.id, client.id, 'text', summary.trim());
    if (!lawyerUser) pushMessage(room.id, SYSTEM_SENDER, 'system', '이 변호사는 아직 앱에 가입하지 않아 사무소 연락처로 안내됩니다.');
    return { ok: true, roomId: room.id };
  },

  /** 상담방을 사건방으로 올립니다. 참여자 모두 본인확인이 필요하고 변호사가 있어야 합니다. */
  promoteToCase(roomId: string, title: string, field: string): RoomCheck {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room || room.kind !== 'consult') return { ok: false, reason: '상담방만 사건방으로 올릴 수 있습니다.' };
    const members = room.memberIds.map(userById).filter((u): u is User => !!u);
    if (!members.some((u) => u.role === 'lawyer')) return { ok: false, reason: '담당 변호사가 방에 있어야 수임할 수 있습니다.' };
    const unverified = members.filter((u) => !u.identityVerified);
    if (unverified.length) return { ok: false, reason: `본인확인이 필요합니다: ${unverified.map((u) => u.nickname).join(', ')}` };
    const caseInfo: CaseInfo = { title: title || room.title, field, stage: '수임', deadlines: [], documents: [], costs: [], progress: [{ id: newId('p'), at: nowIso(), note: '수임' }] };
    updateRoom(roomId, (r) => ({ ...r, kind: 'case', title: caseInfo.title, caseInfo }));
    pushMessage(roomId, SYSTEM_SENDER, 'system', '사건방으로 전환되었습니다. 진행 상황·기일·서류가 이 방에서 공유됩니다.');
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
    const label = { deadline: '기일', document: '서류', cost: '비용', progress: '진행' }[entry.type];
    pushMessage(roomId, SYSTEM_SENDER, 'system', `${label} 추가: ${entry.label}`);
  },

  setCaseStage(roomId: string, stage: CaseInfo['stage']) {
    updateRoom(roomId, (r) => (r.caseInfo ? { ...r, caseInfo: { ...r.caseInfo, stage } } : r));
    pushMessage(roomId, SYSTEM_SENDER, 'system', `사건 단계가 '${stage}'(으)로 바뀌었습니다.`);
  },

  // ---- 경영 에이전트 ----
  summarizeMeeting(roomId: string, transcript: string): RoomCheck {
    if (!canUseAgents(me())) return { ok: false, reason: '어드민이 허용한 사용자만 쓸 수 있습니다.' };
    const notes = summarizeMeeting(transcript);
    set((s) => ({ meetingNotes: { ...s.meetingNotes, [roomId]: notes } }));
    const lines = [
      '회의 정리',
      ...notes.summary.map((x) => `· ${x}`),
      ...(notes.decisions.length ? ['결정사항', ...notes.decisions.map((d) => `· ${d}`)] : []),
      ...(notes.actions.length ? ['할 일', ...notes.actions.map((a) => `· ${a.owner ? `[${a.owner}] ` : ''}${a.task}${a.due ? ` (${a.due})` : ''}`)] : []),
    ];
    pushMessage(roomId, AI_SENDER, 'ai', lines.join('\n'));
    const today = nowIso().slice(0, 10);
    const newRecords = notes.decisions.map((d) => ({ id: newId('d'), date: today, topic: d.slice(0, 30), decision: d }));
    set((s) => ({ decisions: [...newRecords, ...s.decisions] }));
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
      requestedBy: state.currentUserId,
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
            body: `[초안 · ${CHANNEL_LABEL[step.channel]}] ${step.topic} 관련 콘텐츠 ${i}. AI가 연결되면 본문이 자동 작성됩니다.\n\n${AI_DISCLOSURE}`,
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

  approveContent(id: string) {
    set((s) => ({ contents: s.contents.map((c) => (c.id === id ? { ...c, status: '발행 대기' } : c)) }));
  },
};
