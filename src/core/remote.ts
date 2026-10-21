// 서버(Supabase)와 주고받는 부분. 화면은 지금처럼 store의 상태만 보고,
// store가 동작마다 여기 함수로 서버에 같은 변경을 보냅니다 (id는 앱이 정한 값을 그대로 씀).
import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthCode } from './auth-codes';
import type { DtHearing } from './daeryuntop';
import type {
  Account,
  Attachment,
  BoardComment,
  BoardPost,
  BoardReport,
  CaseInfo,
  DeadlineCase,
  FixedDeadline,
  HearingAlert,
  Message,
  NoteThread,
  OpenMessage,
  OpenRoom,
  Room,
  Suggestion,
  User,
  Votes,
} from './types';
import type { Reads } from './messenger';

type Row = Record<string, any>;

const PAGE = 1000;

/** 서버가 한 번에 1000줄까지만 주므로 나눠 받습니다. */
async function all(sb: SupabaseClient, table: string, order: string[], columns = '*'): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns);
    for (const col of order) q = q.order(col);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

async function rpc<T = unknown>(sb: SupabaseClient, fn: string, args: Row = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

async function check(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p;
  if (error) throw error;
}

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : undefined);
const group = <T>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
};

/** 익명 게시판에서 작성자 id가 숨겨진 사람: 글 안의 익명 번호로만 구분합니다. */
export const anonId = (postId: string, aliasNo: number) => `anon:${postId}:${aliasNo}`;

/** 추천·비추천 수로 표 기록을 만듭니다 (내 표만 실제 id). */
function votesOf(ups: number, downs: number, mine: number | null, meId: string): Votes {
  const v: Votes = {};
  if (mine === 1 || mine === -1) v[meId] = mine;
  for (let i = 0; i < ups - (mine === 1 ? 1 : 0); i++) v[`up:${i}`] = 1;
  for (let i = 0; i < downs - (mine === -1 ? 1 : 0); i++) v[`down:${i}`] = -1;
  return v;
}

export type Snapshot = {
  users: User[];
  accounts: Account[];
  rooms: Room[];
  messages: Message[];
  reads: Reads;
  hearingAlerts: HearingAlert[];
  favorites: Record<string, string[]>;
  openRooms: OpenRoom[];
  openMessages: OpenMessage[];
  posts: BoardPost[];
  notes: NoteThread[];
  reports: BoardReport[];
  boardBans: Record<string, string>;
  noticeSeen: Record<string, string[]>;
  suggestions: Suggestion[];
  authCodes: AuthCode[];
  deadlineCases?: DeadlineCase[];
};

/** 로그인한 사람이 볼 수 있는 모든 데이터를 받아 앱 상태 모양으로 바꿉니다. */
export const ROOM_FILES = 'room-files';
export const BOARD_FILES = 'board-files';
const signed = new Map<string, { url: string; until: number }>();

/** 저장소 파일의 임시 주소 (6시간짜리를 받아 두고, 1시간 남으면 새로 받음) */
async function signPaths(sb: SupabaseClient, bucket: string, paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const key = (p: string) => `${bucket}:${p}`;
  const need = [...new Set(paths)].filter((p) => (signed.get(key(p))?.until ?? 0) < now + 3_600_000);
  for (let i = 0; i < need.length; i += 500) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(need.slice(i, i + 500), 6 * 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(key(d.path), { url: d.signedUrl, until: now + 6 * 3_600_000 });
  }
  return new Map(paths.map((p) => [p, signed.get(key(p))?.url ?? '']));
}

/** 저장소 경로에는 영문·숫자만 쓸 수 있어 '첨부 id + 확장자'로 둡니다 (화면의 파일 이름은 따로 저장). */
export function storageName(id: string, name: string): string {
  const ext = /\.[A-Za-z0-9]{1,8}$/.exec(name)?.[0].toLowerCase() ?? '';
  return `${id.replace(/[^\w-]/g, '').slice(0, 40) || 'file'}${ext}`;
}

const pathsIn = (rows: Row[]) => rows.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments.map((a: Row) => a?.path).filter(Boolean) : []));

function attachmentsOf(raw: unknown, urls: Map<string, string>): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Row => !!a && typeof a.path === 'string')
    .map((a) => ({ id: a.id, kind: a.kind, name: a.name, path: a.path, uri: urls.get(a.path) ?? '', ...(a.size ? { size: a.size } : {}), ...(a.mime ? { mime: a.mime } : {}) }));
}

/** 메시지 한 줄을 앱 모양으로 (반응·숨김·첨부 주소 포함) */
export function messageFromRow(m: Row, meId: string, reactions: Row[] | undefined, hidden: boolean, urls: Map<string, string>): Message {
  const atts = attachmentsOf(m.attachments, urls);
  return {
    id: m.id, roomId: m.room_id, senderId: m.sender_kind === 'user' ? m.sender_id ?? '' : m.sender_kind, kind: m.kind, text: m.text, at: m.created_at,
    ...(m.reply_to ? { replyTo: m.reply_to } : {}),
    ...(m.forward_of ? { forwardOf: m.forward_of } : {}),
    ...(m.bundle ? { bundle: m.bundle } : {}),
    ...(m.recalled ? { recalled: true } : {}),
    ...(reactions?.length ? { reactions: Object.fromEntries(reactions.map((r) => [r.user_id, r.emoji])) } : {}),
    ...(m.mentions?.length ? { mentions: m.mentions } : {}),
    ...(m.hearing_alert_id ? { hearingAlertId: m.hearing_alert_id } : {}),
    ...(m.contact_id ? { contactId: m.contact_id } : {}),
    ...(atts.length ? { attachments: atts } : {}),
    ...(hidden ? { deletedFor: [meId] } : {}),
  };
}

/** 실시간으로 받은 메시지 줄들을 앱 모양으로 (첨부 주소만 새로 받음) */
export async function messagesFromRows(sb: SupabaseClient, meId: string, rows: Row[], reactionsOf: (id: string) => Row[] | undefined, hiddenOf: (id: string) => boolean): Promise<Message[]> {
  const urls = await signPaths(sb, ROOM_FILES, pathsIn(rows));
  return rows.map((m) => messageFromRow(m, meId, reactionsOf(m.id), hiddenOf(m.id), urls));
}

/** 바뀐 것만 받기: since 뒤에 새로 오거나 바뀐 메시지와, 공감·숨김 전체(작은 표) */
export async function loadMessagesSince(sb: SupabaseClient, meId: string, since: string): Promise<{ messages: Message[]; syncedAt: string; reactions: Row[]; hides: Row[] }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('messages').select('*').gt('updated_at', since).order('updated_at').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const [reactions, hides] = await Promise.all([all(sb, 'message_reactions', ['message_id', 'user_id']), all(sb, 'message_hides', ['message_id', 'user_id'])]);
  const reactionsBy = group(reactions, (r) => r.message_id);
  const hidden = new Set(hides.map((h) => h.message_id));
  const messages = await messagesFromRows(sb, meId, rows, (id) => reactionsBy.get(id), (id) => hidden.has(id));
  return { messages, syncedAt: rows.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), since), reactions, hides };
}

/**
 * 로그인한 사람이 볼 수 있는 데이터를 받아 앱 상태 모양으로 바꿉니다.
 * withMessages가 false면 메시지·공감·숨김은 받지 않습니다 (메시지는 실시간·loadMessagesSince로 따로 받음).
 */
export async function loadAll(sb: SupabaseClient, meId: string, withMessages = true): Promise<Snapshot & { syncedAt?: string }> {
  const none = async () => [] as Row[];
  const [
    profiles, favorites, rooms, members, messages, reactions, hides, notices,
    cases, hearings, docs, costs, progress, alerts, recipients,
    openRooms, openMembers, openMessages, myOpen,
    posts, comments, notes, noteMessages, reports, bans, noticeSeen, suggestions, authCodes, limits,
  ] = await Promise.all([
    all(sb, 'profiles', ['created_at', 'id']),
    all(sb, 'favorites', ['user_id', 'target_id']),
    all(sb, 'rooms', ['created_at', 'id']),
    all(sb, 'room_members', ['room_id', 'joined_at', 'user_id']),
    withMessages ? all(sb, 'messages', ['created_at', 'id']) : none(),
    withMessages ? all(sb, 'message_reactions', ['message_id', 'user_id']) : none(),
    withMessages ? all(sb, 'message_hides', ['message_id', 'user_id']) : none(),
    all(sb, 'room_notices', ['created_at', 'id']),
    all(sb, 'cases', ['room_id']),
    all(sb, 'hearings', ['date', 'time', 'id']),
    all(sb, 'case_documents', ['added_at', 'id']),
    all(sb, 'case_costs', ['id']),
    all(sb, 'case_progress', ['at', 'id']),
    all(sb, 'hearing_alerts', ['created_at', 'id']),
    all(sb, 'hearing_alert_recipients', ['alert_id', 'user_id']),
    all(sb, 'open_room_feed', ['created_at', 'id']),
    // 실제 이용자(user_id)는 열 권한으로 숨겨져 있어 보이는 칸만 고릅니다.
    all(sb, 'open_members', ['joined_at', 'id'], 'id, room_id, alias, is_host, joined_at, left_at'),
    all(sb, 'open_message_feed', ['created_at', 'id']),
    rpc<Row[]>(sb, 'my_open_members'),
    all(sb, 'post_feed', ['created_at', 'id']),
    all(sb, 'comment_feed', ['created_at', 'id']),
    all(sb, 'note_feed', ['id']),
    all(sb, 'note_message_feed', ['created_at', 'id']),
    all(sb, 'reports', ['created_at', 'id']),
    all(sb, 'board_bans', ['user_id']),
    all(sb, 'notice_seen', ['post_id']),
    all(sb, 'suggestions', ['created_at', 'id']),
    all(sb, 'auth_codes', ['created_at', 'id']),
    all(sb, 'case_deadlines', ['due_date', 'id']),
  ]);

  // ---- 사람 ----
  const users: User[] = profiles.map((p) => ({
    id: p.id, nickname: p.nickname, role: p.role, agentAccess: p.agent_access, membership: p.membership,
    officeId: opt(p.office_id), firm: opt(p.firm), title: opt(p.title), dept: opt(p.dept), branch: opt(p.branch),
    phone: opt(p.phone), email: opt(p.email), birthday: opt(p.birthday), joinedAt: opt(p.joined_at),
    status: opt(p.status), presence: p.presence, ...(p.super_admin ? { superAdmin: true } : {}), ...(p.is_executive ? { executive: true } : {}),
  }));
  const accounts: Account[] = profiles.map((p) => ({
    userId: p.id, loginId: p.login_id, password: '', active: p.active, createdAt: p.created_at, lastLoginAt: opt(p.last_login_at),
  }));
  const me = users.find((u) => u.id === meId);

  // ---- 대화방 ----
  const membersBy = group(members, (m) => m.room_id);
  const reads: Reads = {};
  for (const m of members) if (m.last_read_at) (reads[m.room_id] ??= {})[m.user_id] = m.last_read_at;
  const caseBy = new Map(cases.map((c) => [c.room_id, c]));
  const hearingsBy = group(hearings, (h) => h.room_id);
  const docsBy = group(docs, (d) => d.room_id);
  const costsBy = group(costs, (d) => d.room_id);
  const progressBy = group(progress, (d) => d.room_id);
  const limitsBy = group(limits, (d) => d.room_id);
  const noticesBy = group([...notices].reverse(), (n) => n.room_id);
  const caseInfo = (roomId: string): CaseInfo | undefined => {
    const c = caseBy.get(roomId);
    if (!c) return undefined;
    return {
      title: c.title, field: c.field, stage: c.stage,
      deadlines: (hearingsBy.get(roomId) ?? []).map((h) => ({
        id: h.id, label: h.label, date: h.date, time: hhmm(h.time), place: opt(h.place), source: h.source,
        ...(h.external_id ? { externalId: h.external_id } : {}), ...(h.firm_only ? { firmOnly: true } : {}), ...(h.strict ? { strict: true } : {}),
      })),
      documents: (docsBy.get(roomId) ?? []).map((d) => ({ id: d.id, name: d.name, addedAt: d.added_at })),
      costs: (costsBy.get(roomId) ?? []).map((d) => ({ id: d.id, label: d.label, amount: Number(d.amount) })),
      progress: (progressBy.get(roomId) ?? []).map((d) => ({ id: d.id, at: d.at, note: d.note })),
      ...(limitsBy.has(roomId) ? { limits: (limitsBy.get(roomId) ?? []).map(limitFromRow) } : {}),
      ...(c.deadline_alerts === false ? { limitAlerts: false } : {}),
      ...(c.case_no ? { caseNo: c.case_no } : {}),
    };
  };
  const roomList: Room[] = [...rooms].reverse().map((r) => {
    const ms = membersBy.get(r.id) ?? [];
    const by = (f: (m: Row) => boolean) => ms.filter(f).map((m) => m.user_id as string);
    const info = caseInfo(r.id);
    return {
      id: r.id, kind: r.kind, mode: r.mode, title: r.title, createdBy: r.created_by ?? '', createdAt: r.created_at,
      memberIds: ms.map((m) => m.user_id), masters: by((m) => m.is_master),
      officeId: opt(r.office_id), lawyerId: opt(r.lawyer_id), ...(info ? { caseInfo: info } : {}),
      pinnedBy: by((m) => m.pinned),
      notify: Object.fromEntries(ms.filter((m) => m.notify !== 'all').map((m) => [m.user_id, m.notify])),
      hiddenAt: Object.fromEntries(ms.filter((m) => m.hidden_at).map((m) => [m.user_id, m.hidden_at])),
      notices: (noticesBy.get(r.id) ?? []).map((n) => ({ id: n.id, messageId: n.message_id, text: n.text, by: n.by_bot ? 'bot' : n.by_id ?? '', at: n.created_at })),
      noticeHiddenBy: by((m) => m.notice_hidden),
    };
  });

  const reactionsBy = group(reactions, (r) => r.message_id);
  const hidden = new Set(hides.map((h) => h.message_id));
  const [urls, boardUrls] = await Promise.all([signPaths(sb, ROOM_FILES, pathsIn(messages)), signPaths(sb, BOARD_FILES, pathsIn(posts))]);
  const messageList: Message[] = messages.map((m) => messageFromRow(m, meId, reactionsBy.get(m.id), hidden.has(m.id), urls));
  const syncedAt = messages.reduce<string | undefined>((a, r) => (!a || r.updated_at > a ? r.updated_at : a), undefined);

  const recipientsBy = group(recipients, (r) => r.alert_id);
  const hearingAlerts: HearingAlert[] = alerts.map((a) => {
    const rs = recipientsBy.get(a.id) ?? [];
    return {
      id: a.id, roomId: a.room_id, hearingId: a.hearing_id ?? '', change: a.change, label: a.label, date: a.date,
      time: hhmm(a.time), place: opt(a.place), prevDate: opt(a.prev_date), prevTime: hhmm(a.prev_time), source: a.source,
      at: a.created_at, messageId: a.message_id ?? '', recipients: rs.map((r) => r.user_id),
      ackedBy: Object.fromEntries(rs.filter((r) => r.acked_at).map((r) => [r.user_id, r.acked_at])),
    };
  });

  // ---- 오픈대화방: 다른 참여자는 참여자 번호로만 (관리자어드민은 실제 계정) ----
  const identities = me?.role === 'admin' && me.superAdmin ? await rpc<Row[]>(sb, 'open_room_identities', { p_room: null }) : [];
  const realOf = new Map<string, string>(identities.map((i) => [i.member_id, i.user_id]));
  for (const m of myOpen) realOf.set(m.member_id, meId);
  const userOfMember = (memberId: string) => realOf.get(memberId) ?? memberId;
  const openMembersBy = group(openMembers.filter((m) => !m.left_at), (m) => m.room_id);
  const openRoomList: OpenRoom[] = [...openRooms].reverse().map((r) => {
    const ms = openMembersBy.get(r.id) ?? [];
    return {
      id: r.id, title: r.title, description: r.description, tags: r.tags, max: r.max_members, createdAt: r.created_at,
      hostId: userOfMember(ms.find((m) => m.is_host)?.id ?? ''),
      members: ms.map((m) => ({ userId: userOfMember(m.id), alias: m.alias, joinedAt: m.joined_at })),
      banned: r.banned ? [meId] : [],
      ...(r.locked ? { locked: true } : {}),
    };
  });
  const openMessageList: OpenMessage[] = openMessages.map((m) => ({
    id: m.id, roomId: m.room_id, senderId: m.member_id ? userOfMember(m.member_id) : '', text: m.text, at: m.created_at, ...(m.system ? { system: true } : {}),
  }));
  openMemberIds = new Map(openMembers.filter((m) => !m.left_at).map((m) => [`${m.room_id}:${userOfMember(m.id)}`, m.id]));

  // ---- 게시판 ----
  const commentsBy = group(comments, (c) => c.post_id);
  const postList: BoardPost[] = [...posts].reverse().map((p) => {
    const authorId: string = p.author_bot ?? p.author_id ?? (p.mine ? meId : anonId(p.id, 1));
    const aliases: Record<string, number> = { [authorId]: 1 };
    const cs: BoardComment[] = (commentsBy.get(p.id) ?? []).map((c) => {
      const cid: string = c.author_id ?? (c.mine ? meId : anonId(p.id, c.alias_no ?? 0));
      if (c.alias_no) aliases[cid] = c.alias_no;
      return {
        id: c.id, authorId: cid, text: c.text, at: c.created_at, votes: votesOf(c.ups, c.downs, c.my_vote, meId),
        ...(c.parent_id ? { parentId: c.parent_id } : {}), ...(c.deleted ? { deleted: true } : {}),
      };
    });
    return {
      id: p.id, authorId, field: p.field, title: p.title, body: p.body, at: p.created_at, votes: votesOf(p.ups, p.downs, p.my_vote, meId), comments: cs, aliases,
      ...(p.board !== 'anon' ? { board: p.board } : {}),
      ...(Array.isArray(p.attachments) && p.attachments.length ? { attachments: attachmentsOf(p.attachments, boardUrls) } : {}),
      ...(p.notice ? { notice: true } : {}), ...(p.source_id ? { sourceId: p.source_id } : {}),
    };
  });
  const noteMessagesBy = group(noteMessages, (m) => m.thread_id);
  const noteList: NoteThread[] = notes.map((n) => {
    const other: string = n.other_id ?? anonId(n.post_id, n.other_alias_no ?? 0);
    return {
      id: n.id, postId: n.post_id, memberIds: [meId, other],
      messages: (noteMessagesBy.get(n.id) ?? []).map((m) => ({ id: m.id, senderId: m.mine ? meId : other, text: m.text, at: m.created_at })),
      readAt: n.my_read_at ? { [meId]: n.my_read_at } : {},
    };
  });

  return {
    users, accounts, rooms: roomList, messages: messageList, syncedAt, reads, hearingAlerts,
    favorites: { [meId]: favorites.map((f) => f.target_id) },
    openRooms: openRoomList, openMessages: openMessageList, posts: postList, notes: noteList,
    reports: [...reports].reverse().map((r) => ({
      id: r.id, postId: r.post_id ?? '', reporterId: r.reporter_id, reason: r.reason, at: r.created_at, status: r.status,
      ...(r.comment_id ? { commentId: r.comment_id } : {}), ...(r.resolution ? { resolution: r.resolution } : {}),
    })),
    boardBans: Object.fromEntries(bans.map((b) => [b.user_id, b.until])),
    noticeSeen: { [meId]: noticeSeen.map((n) => n.post_id) },
    suggestions: [...suggestions].reverse().map((x) => ({
      id: x.id, authorId: x.author_id, body: x.body, at: x.created_at, status: x.status,
      ...(x.answer ? { answer: x.answer } : {}), ...(x.answered_at ? { answeredAt: x.answered_at } : {}),
    })),
    authCodes: authCodes.map((c) => ({ id: c.id, userId: c.user_id, code: c.code, at: c.created_at, expiresAt: c.expires_at, ...(c.read ? { read: true } : {}) })),
    // 어드민은 사건방 참여자가 아니어서 사건별 불변기간을 따로 받습니다
    ...(me?.role === 'admin' ? { deadlineCases: (await rpc<Row[]>(sb, 'admin_deadline_cases')).map(deadlineCaseFromRow) } : {}),
  };
}

function limitFromRow(d: Row): FixedDeadline {
  return {
    id: d.id, label: d.label, due: d.due_date ?? d.due, source: d.source ?? 'manual',
    ...(d.lawyer_id ? { lawyerId: d.lawyer_id } : {}), ...(d.external_id ? { externalId: d.external_id } : {}), ...((d.handled_at ?? d.handledAt) ? { handledAt: d.handled_at ?? d.handledAt } : {}),
  };
}

function deadlineCaseFromRow(c: Row): DeadlineCase {
  return { roomId: c.room_id, title: c.title, alertsOn: c.alerts_on, office: c.office, limits: (c.deadlines ?? []).map(limitFromRow), ...(c.case_no ? { caseNo: c.case_no } : {}) };
}

/** 오픈대화방 '방 id:사용자 id' → 참여자 번호 (내보내기에 씀) */
let openMemberIds = new Map<string, string>();

// ---- 쓰기 ----
// 실패하면 서버의 사유를 담은 오류를 던집니다.

export type Remote = ReturnType<typeof remoteOps>;

export function remoteOps(sb: SupabaseClient) {
  const me = async () => (await sb.auth.getSession()).data.session?.user.id ?? '';
  const memberRow = async (roomId: string, patch: Row) => check(sb.from('room_members').update(patch).eq('room_id', roomId).eq('user_id', await me()));
  /** 게시판 첨부: 서버 함수가 내준 1회용 주소로 올립니다 (익명 글쓴이가 저장소 기록에 남지 않게) */
  const uploadBoardFiles = async (p: BoardPost) => {
    const files = p.attachments ?? [];
    const { data, error } = await sb.functions.invoke('board-upload', { body: { board: p.board ?? 'anon', postId: p.id, files: files.map(({ id, name }) => ({ id, name })) } });
    if (error || !data?.ok) {
      const ctx = (error as { context?: Response } | null)?.context;
      const reason = data?.reason ?? (ctx && typeof ctx.json === 'function' ? (await ctx.json().catch(() => undefined))?.reason : undefined);
      throw new Error(reason ?? '첨부를 올리지 못했습니다.');
    }
    const slots = new Map<string, { path: string; token: string }>((data.files as Row[]).map((f) => [f.id, f as { path: string; token: string }]));
    const out = [];
    for (const a of files) {
      const slot = slots.get(a.id);
      if (!slot) throw new Error('첨부를 올리지 못했습니다.');
      const body = await (await fetch(a.uri)).arrayBuffer();
      const { error: ue } = await sb.storage.from(BOARD_FILES).uploadToSignedUrl(slot.path, slot.token, body, { contentType: a.mime ?? 'application/octet-stream' });
      if (ue) throw new Error(/exceeded|too large|size/i.test(ue.message) ? '파일은 50MB까지 올릴 수 있습니다.' : '첨부를 올리지 못했습니다.');
      out.push({ id: a.id, kind: a.kind, name: a.name, size: a.size, mime: a.mime, path: slot.path });
    }
    return out;
  };
  return {
    // 계정
    touchLogin: () => rpc<boolean>(sb, 'touch_login'),
    accounts: async (body: Row) => {
      const { data, error } = await sb.functions.invoke('admin-accounts', { body });
      if (error) {
        // 함수가 사유를 담아 거절한 경우
        const ctx = (error as { context?: Response }).context;
        const reason = ctx && typeof ctx.json === 'function' ? (await ctx.json().catch(() => undefined))?.reason : undefined;
        throw new Error(reason ?? error.message);
      }
      if (!data?.ok) throw new Error(data?.reason ?? '처리하지 못했습니다.');
    },
    setRole: (u: string, role: string) => rpc(sb, 'admin_set_role', { p_user: u, p_role: role }),
    setActive: (u: string, on: boolean) => rpc(sb, 'admin_set_active', { p_user: u, p_active: on }),
    setAgentAccess: (u: string, on: boolean) => rpc(sb, 'admin_set_agent_access', { p_user: u, p_on: on }),
    setTitles: (ids: string[], title: string) => rpc(sb, 'admin_set_titles', { p_users: ids, p_title: title }),
    setSuperAdmin: (u: string, on: boolean) => rpc(sb, 'admin_set_super_admin', { p_user: u, p_on: on }),
    updateProfile: async (patch: Row) => check(sb.from('profiles').update(patch).eq('id', await me())),
    toggleFavorite: async (target: string, on: boolean) => {
      const uid = await me();
      if (on) await check(sb.from('favorites').insert({ user_id: uid, target_id: target }));
      else await check(sb.from('favorites').delete().eq('user_id', uid).eq('target_id', target));
    },

    // 메신저
    postMessage: (m: Message) =>
      rpc(sb, 'post_message', {
        p_id: m.id, p_room: m.roomId, p_kind: m.kind, p_text: m.text, p_reply_to: m.replyTo ?? null, p_forward_of: m.forwardOf ?? null,
        p_bundle: m.bundle ?? null, p_mentions: m.mentions ?? [], p_contact: m.contactId ?? null,
        p_attachments: (m.attachments ?? []).map(({ id, kind, name, size, mime, path }) => ({ id, kind, name, size, mime, path })),
      }),
    /** 방 사진·파일 올리기: '방 id/메시지 id/첨부 id.확장자' 경로. 올린 경로를 붙여 돌려줍니다. */
    uploadRoomFiles: async (roomId: string, messageId: string, atts: Attachment[]): Promise<Attachment[]> => {
      const out: Attachment[] = [];
      for (const a of atts) {
        const path = `${roomId}/${messageId}/${storageName(a.id, a.name)}`;
        const body = await (await fetch(a.uri)).arrayBuffer();
        const { error } = await sb.storage.from(ROOM_FILES).upload(path, body, { contentType: a.mime ?? 'application/octet-stream', upsert: true });
        if (error) throw new Error(/exceeded|too large|size/i.test(error.message) ? '파일은 50MB까지 올릴 수 있습니다.' : '파일을 올리지 못했습니다.');
        out.push({ ...a, path });
      }
      return out;
    },
    createRoom: (r: Room) => rpc(sb, 'create_room', { p_id: r.id, p_kind: r.kind, p_mode: r.mode, p_title: r.title, p_members: r.memberIds }),
    openLawyerRoom: (r: Room) =>
      rpc(sb, 'open_lawyer_room', {
        p_id: r.id, p_kind: r.kind, p_title: r.title, p_office: r.officeId ?? null, p_lawyer: r.lawyerId ?? null,
        p_field: r.caseInfo?.field ?? '', p_progress_id: r.caseInfo?.progress[0]?.id ?? undefined,
      }),
    addMembers: (roomId: string, ids: string[]) => rpc(sb, 'add_members', { p_room: roomId, p_users: ids }),
    kick: (roomId: string, u: string) => rpc(sb, 'kick_member', { p_room: roomId, p_user: u }),
    setMaster: (roomId: string, u: string, on: boolean) => rpc(sb, 'set_master', { p_room: roomId, p_user: u, p_on: on }),
    leaveRoom: (roomId: string) => rpc(sb, 'leave_room', { p_room: roomId }),
    markRead: (roomId: string) => rpc(sb, 'mark_read', { p_room: roomId }),
    setPinned: (roomId: string, on: boolean) => memberRow(roomId, { pinned: on }),
    setNotify: (roomId: string, level: string) => memberRow(roomId, { notify: level }),
    setHidden: (roomId: string, at: string | null) => memberRow(roomId, { hidden_at: at }),
    hideNotices: (roomId: string) => memberRow(roomId, { notice_hidden: true }),
    setNotice: (id: string, roomId: string, messageId: string, text: string) => rpc(sb, 'set_notice', { p_id: id, p_room: roomId, p_message: messageId, p_text: text }),
    removeNotice: (id: string) => rpc(sb, 'remove_notice', { p_id: id }),
    react: async (messageId: string, emoji: string | undefined) => {
      const uid = await me();
      if (emoji) await check(sb.from('message_reactions').upsert({ message_id: messageId, user_id: uid, emoji }));
      else await check(sb.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', uid));
    },
    recall: (id: string) => rpc(sb, 'recall_message', { p_id: id }),
    hideMessage: async (id: string) => check(sb.from('message_hides').insert({ message_id: id, user_id: await me() })),

    // 사건·기일
    promoteCase: (roomId: string, title: string, field: string, progressId: string) => rpc(sb, 'promote_case', { p_room: roomId, p_title: title, p_field: field, p_progress_id: progressId }),
    addCaseEntry: (id: string, roomId: string, type: string, label: string, amount?: number) => rpc(sb, 'add_case_entry', { p_id: id, p_room: roomId, p_type: type, p_label: label, p_amount: amount ?? 0 }),
    setCaseStage: (roomId: string, stage: string) => rpc(sb, 'set_case_stage', { p_room: roomId, p_stage: stage }),
    syncHearing: (a: HearingAlert, x: { prevId?: string; noticeId: string; noticeText: string; progressId: string; progressNote: string }) =>
      rpc(sb, 'sync_hearing', {
        p_room: a.roomId, p_change: a.change, p_label: a.label, p_date: a.date, p_time: a.time ?? null, p_place: a.place ?? null,
        p_hearing: x.prevId ?? null, p_source: a.source, p_new_hearing_id: a.hearingId, p_alert_id: a.id, p_message_id: a.messageId,
        p_notice_id: x.noticeId, p_notice_text: x.noticeText, p_progress_id: x.progressId, p_progress_note: x.progressNote, p_recipients: a.recipients,
      }),
    ackHearing: (id: string) => rpc(sb, 'ack_hearing', { p_alert: id }),
    remindHearing: (id: string) => rpc(sb, 'remind_hearing', { p_alert: id }),
    addDeadline: (id: string, roomId: string, label: string, due: string, lawyerId?: string) =>
      rpc(sb, 'add_deadline', { p_id: id, p_room: roomId, p_label: label, p_due: due, p_lawyer: lawyerId ?? null }),
    setDeadlineHandled: (id: string, done: boolean) => rpc(sb, 'set_deadline_handled', { p_id: id, p_done: done }),
    deleteDeadline: (id: string) => rpc(sb, 'delete_deadline', { p_id: id }),
    setExecutive: (u: string, on: boolean) => rpc(sb, 'admin_set_executive', { p_user: u, p_on: on }),
    setDeadlineAlerts: (roomId: string, on: boolean) => rpc(sb, 'admin_set_deadline_alerts', { p_room: roomId, p_on: on }),
    setCaseNo: (roomId: string, caseNo: string) => rpc(sb, 'admin_set_case_no', { p_room: roomId, p_case_no: caseNo }),
    importDaeryuntop: (rows: DtHearing[]) => rpc<{ id: string; caseNo?: string; result: string }[]>(sb, 'admin_import_daeryuntop', { p_rows: rows }),

    // 오픈대화방
    createOpenRoom: (r: OpenRoom, alias: string, password: string) =>
      rpc(sb, 'create_open_room', { p_id: r.id, p_title: r.title, p_description: r.description, p_tags: r.tags, p_max: r.max, p_alias: alias, p_password: password || null }),
    joinOpenRoom: (roomId: string, alias: string, password: string) => rpc(sb, 'join_open_room', { p_room: roomId, p_alias: alias, p_password: password }),
    sendOpen: (id: string, roomId: string, text: string) => rpc(sb, 'send_open', { p_id: id, p_room: roomId, p_text: text }),
    leaveOpenRoom: (roomId: string) => rpc(sb, 'leave_open_room', { p_room: roomId }),
    kickOpen: (roomId: string, userId: string) => rpc(sb, 'kick_open', { p_room: roomId, p_member: openMemberIds.get(`${roomId}:${userId}`) ?? userId }),
    setOpenPassword: (roomId: string, pw: string) => rpc(sb, 'set_open_password', { p_room: roomId, p_password: pw }),
    deleteOpenRoom: (roomId: string) => rpc(sb, 'delete_open_room', { p_room: roomId }),

    // 게시판
    createPost: async (p: BoardPost) => {
      const atts = p.attachments?.length ? await uploadBoardFiles(p) : [];
      await rpc(sb, 'create_post', { p_id: p.id, p_board: p.board ?? 'anon', p_title: p.title, p_body: p.body, p_field: p.field, p_notice: !!p.notice, p_attachments: atts });
    },
    comment: (id: string, postId: string, text: string, parentId?: string) => rpc(sb, 'comment_post', { p_id: id, p_post: postId, p_text: text, p_parent: parentId ?? null }),
    votePost: (postId: string, v: number) => rpc(sb, 'vote_post', { p_post: postId, p_value: v }),
    voteComment: (commentId: string, v: number) => rpc(sb, 'vote_comment', { p_comment: commentId, p_value: v }),
    openNote: (id: string, postId: string, commentId: string | null) => rpc(sb, 'open_note', { p_id: id, p_post: postId, p_to_comment: commentId }),
    sendNote: (id: string, noteId: string, text: string) => rpc(sb, 'send_note', { p_id: id, p_thread: noteId, p_text: text }),
    readNote: (noteId: string) => rpc(sb, 'read_note', { p_thread: noteId }),
    report: (id: string, postId: string, reason: string, commentId?: string) => rpc(sb, 'report_post', { p_id: id, p_post: postId, p_reason: reason, p_comment: commentId ?? null }),
    deletePost: (postId: string) => rpc(sb, 'admin_delete_post', { p_post: postId }),
    deleteComment: (commentId: string) => rpc(sb, 'admin_delete_comment', { p_comment: commentId }),
    restrict: (postId: string, commentId: string | null, hours: number) => rpc(sb, 'admin_restrict', { p_post: postId, p_comment: commentId, p_hours: hours }),
    liftRestriction: (u: string) => rpc(sb, 'admin_lift_restriction', { p_user: u }),
    closeReport: (id: string, status: string, resolution: string) => rpc(sb, 'admin_close_report', { p_report: id, p_status: status, p_resolution: resolution }),
    noticesSeen: async (postIds: string[]) => {
      const uid = await me();
      await check(sb.from('notice_seen').upsert(postIds.map((post_id) => ({ user_id: uid, post_id }))));
    },

    // 건의사항·인증코드
    submitSuggestion: (s: Suggestion) => check(sb.from('suggestions').insert({ id: s.id, author_id: s.authorId, body: s.body })),
    answerSuggestion: (id: string, status: string, answer: string) => rpc(sb, 'answer_suggestion', { p_id: id, p_status: status, p_answer: answer }),
    readAuthCodes: async () => check(sb.from('auth_codes').update({ read: true }).eq('user_id', await me()).eq('read', false)),
  };
}
