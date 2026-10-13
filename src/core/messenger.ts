// 메신저 규칙 (네이버웍스 메신저의 주소록·대화 기능을 참고)
// 읽음 수, 안 읽은 수, 멘션, 방 정렬·숨김, 조직도 묶음, 주소록 검색
import { AI_SENDER, BOT_SENDER, SYSTEM_SENDER, type Message, type NotifyLevel, type Presence, type Room, type User } from './types';

export type Reads = Record<string, Record<string, string>>;

const HUMAN = (senderId: string) => senderId !== SYSTEM_SENDER && senderId !== AI_SENDER && senderId !== BOT_SENDER;

/** 이름 옆에 붙는 직책·지점: '서승덕 Junior Associate Attorney(부산총괄본부)' */
export function displayName(u: User): string {
  return `${u.nickname}${u.title ? ` ${u.title}` : ''}${u.branch ? `(${u.branch})` : ''}`;
}

export function lastReadAt(reads: Reads, roomId: string, userId: string): string {
  return reads[roomId]?.[userId] ?? '';
}

/** 메시지를 읽은 사람 수 (보낸 사람 제외) */
export function readCount(m: Message, room: Room, reads: Reads): number {
  return room.memberIds.filter((id) => id !== m.senderId && lastReadAt(reads, room.id, id) >= m.at).length;
}

export function visibleMessages(messages: Message[], roomId: string, userId: string): Message[] {
  return messages.filter((m) => m.roomId === roomId && !m.deletedFor?.includes(userId));
}

export function unreadCount(room: Room, userId: string, messages: Message[], reads: Reads): number {
  const read = lastReadAt(reads, room.id, userId);
  return messages.filter((m) => m.roomId === room.id && m.senderId !== userId && m.senderId !== SYSTEM_SENDER && m.at > read && !m.recalled).length;
}

export function mentionedUnread(room: Room, userId: string, messages: Message[], reads: Reads): boolean {
  const read = lastReadAt(reads, room.id, userId);
  return messages.some((m) => m.roomId === room.id && m.at > read && !m.recalled && (m.mentions?.includes(userId) || m.mentions?.includes('all')));
}

/** 상태 목록: 화면 색은 tone (on=대화 가능, busy=용무 중, off=자리 비움, dnd=방해 금지) */
export const PRESENCE: { key: Presence; label: string; tone: 'on' | 'busy' | 'off' | 'dnd' }[] = [
  { key: 'available', label: '대화 가능', tone: 'on' },
  { key: 'busy', label: '다른 용무 중', tone: 'busy' },
  { key: 'meeting', label: '회의 중', tone: 'busy' },
  { key: 'court', label: '재판 중', tone: 'busy' },
  { key: 'outside', label: '외근 중', tone: 'off' },
  { key: 'trip', label: '출장 중', tone: 'off' },
  { key: 'vacation', label: '휴가 중', tone: 'off' },
  { key: 'dnd', label: '방해 금지', tone: 'dnd' },
];

export function presenceOf(u: User) {
  return PRESENCE.find((p) => p.key === (u.presence ?? 'available'))!;
}

/** 의뢰인이 들어 있는 방: 변호사·직원에게는 '클라이언트' 탭에만 보입니다. */
export function hasClient(room: Room, users: User[]): boolean {
  return room.memberIds.some((id) => users.find((u) => u.id === id)?.role === 'client');
}

/** 의뢰인 계정이 대화 탭에서 보는 방: 내 상담·사건방만 */
export function clientCanSee(room: Room, me: User): boolean {
  return room.memberIds.includes(me.id) && (room.kind === 'case' || room.kind === 'consult');
}

/** 방 마스터: 지정된 사람, 없으면 방을 만든 사람 */
export function roomMasters(room: Room): string[] {
  return room.masters?.length ? room.masters : [room.createdBy];
}

export function isMaster(room: Room, userId: string): boolean {
  return roomMasters(room).includes(userId);
}

export function notifyLevel(room: Room, userId: string): NotifyLevel {
  return room.notify?.[userId] ?? 'all';
}

export function lastMessage(room: Room, messages: Message[], userId: string): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.roomId === room.id && !m.deletedFor?.includes(userId)) return m;
  }
  return undefined;
}

export function isHidden(room: Room, userId: string, messages: Message[]): boolean {
  const at = room.hiddenAt?.[userId];
  if (!at) return false;
  const last = lastMessage(room, messages, userId);
  return !last || last.at <= at;
}

/** 대화 목록: 고정한 방이 위, 그다음 최근 메시지 순 */
export function sortRooms(rooms: Room[], userId: string, messages: Message[]): Room[] {
  const key = (r: Room) => lastMessage(r, messages, userId)?.at ?? r.createdAt;
  return [...rooms].sort((a, b) => {
    const pa = a.pinnedBy?.includes(userId) ? 1 : 0;
    const pb = b.pinnedBy?.includes(userId) ? 1 : 0;
    return pb - pa || key(b).localeCompare(key(a));
  });
}

export function previewText(m: Message | undefined, users: User[]): string {
  if (!m) return '';
  if (m.recalled) return '회수된 메시지입니다.';
  if (m.kind === 'contact') return `연락처: ${users.find((u) => u.id === m.contactId)?.nickname ?? ''}`;
  if (m.forwardOf) return `[전달] ${m.forwardOf.text.split('\n')[0]}`;
  return m.text.split('\n')[0];
}

/** 본문의 '@이름'을 방 멤버로 찾습니다. '@전체' 또는 '@All'은 모두. */
export function parseMentions(text: string, members: User[]): string[] {
  const ids: string[] = [];
  if (/@(전체|all)(?![\w가-힣])/i.test(text)) ids.push('all');
  // 긴 이름부터 맞춰 '김수'와 '김수민'이 섞이지 않게 합니다.
  for (const u of [...members].sort((a, b) => b.nickname.length - a.nickname.length)) {
    if (text.includes(`@${u.nickname}`)) ids.push(u.id);
  }
  return ids;
}

/** 멘션 강조 표시용으로 본문을 나눕니다. */
export function splitMentions(text: string, names: string[]): { text: string; mention: boolean }[] {
  const all = ['전체', 'All', ...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const alt = all.join('|');
  const one = new RegExp(`^@(?:${alt})$`);
  return text
    .split(new RegExp(`(@(?:${alt}))`))
    .filter(Boolean)
    .map((part) => ({ text: part, mention: one.test(part) }));
}

/** 입력 중인 '@검색어' (커서가 끝에 있다고 보고 마지막 @ 뒤를 봅니다) */
export function mentionQuery(text: string): string | undefined {
  const m = /@([^\s@]*)$/.exec(text);
  return m ? m[1] : undefined;
}

const URL_RE = /https?:\/\/[^\s)]+/g;

export function roomLinks(messages: Message[]): { url: string; at: string }[] {
  const out: { url: string; at: string }[] = [];
  for (const m of messages) for (const url of m.text.match(URL_RE) ?? []) out.push({ url, at: m.at });
  return out.reverse();
}

// ---- 주소록 ----

export const NO_DEPT = '소속 미지정';

/** 조직도: 부서별 묶음 (부서 이름순) */
export function orgGroups(users: User[]): { dept: string; members: User[] }[] {
  const map = new Map<string, User[]>();
  for (const u of users) {
    const d = u.dept ?? NO_DEPT;
    map.set(d, [...(map.get(d) ?? []), u]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === NO_DEPT ? 1 : b === NO_DEPT ? -1 : a.localeCompare(b, 'ko')))
    .map(([dept, members]) => ({ dept, members: members.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko')) }));
}

/** 외부 연락처: 같은 방에 있지만 우리 조직이 아닌 사람 (예: 사건방의 의뢰인) */
export function externalContacts(me: User, users: User[], rooms: Room[]): User[] {
  const ids = new Set(rooms.filter((r) => r.memberIds.includes(me.id)).flatMap((r) => r.memberIds));
  return users.filter((u) => u.id !== me.id && ids.has(u.id) && (!me.firm || u.firm !== me.firm));
}

export type DirectoryHit =
  | { type: 'member'; user: User }
  | { type: 'dept'; dept: string; count: number }
  | { type: 'room'; room: Room };

/** 주소록 검색: 구성원(이름·직책·부서·지점), 조직(부서), 그룹(내 대화방) */
export function searchDirectory(query: string, contacts: User[], myRooms: Room[]): DirectoryHit[] {
  const q = query.trim();
  if (!q) return [];
  const members: DirectoryHit[] = contacts
    .filter((u) => [u.nickname, u.title, u.dept, u.branch].some((v) => v?.includes(q)))
    .map((user) => ({ type: 'member', user }));
  const depts: DirectoryHit[] = orgGroups(contacts)
    .filter((g) => g.dept.includes(q))
    .map((g) => ({ type: 'dept', dept: g.dept, count: g.members.length }));
  const rooms: DirectoryHit[] = myRooms.filter((r) => r.title.includes(q) && r.memberIds.length > 2).map((room) => ({ type: 'room', room }));
  return [...members, ...depts, ...rooms];
}

// ---- 읽은 사람·공감한 사람 ----

/** 읽음 상세: 보낸 사람을 뺀 방 멤버를 읽음/안 읽음으로 나눕니다. */
export function readers(m: Message, room: Room, reads: Reads, users: User[]): { read: User[]; unread: User[] } {
  const others = room.memberIds.filter((id) => id !== m.senderId).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  return {
    read: others.filter((u) => lastReadAt(reads, room.id, u.id) >= m.at),
    unread: others.filter((u) => lastReadAt(reads, room.id, u.id) < m.at),
  };
}

/** 공감 상세: 이모지별 누른 사람 (많은 순) */
export function reactionGroups(m: Message): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const [uid, e] of Object.entries(m.reactions ?? {})) map.set(e, [...(map.get(e) ?? []), uid]);
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

// ---- 날짜 ----

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

/** 기기 시간 기준 날짜 키 'YYYY-MM-DD' */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 날짜 구분선: '2026년 10월 8일 목요일' */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

/** 메시지가 있는 날짜들 (캘린더에서 고를 수 있는 날) */
export function messageDays(messages: Message[]): Set<string> {
  return new Set(messages.filter((m) => m.senderId !== SYSTEM_SENDER).map((m) => dayKey(m.at)));
}

/** 그날의 첫 메시지 */
export function firstOfDay(messages: Message[], day: string): Message | undefined {
  return messages.find((m) => dayKey(m.at) === day);
}

const searchable = (m: Message) => !m.recalled && m.senderId !== SYSTEM_SENDER;
const textOf = (m: Message) => (m.bundle ? m.bundle.items.map((i) => i.text).join('\n') : m.text);

/** 방 안 검색: 내용에 검색어가 있는 말풍선 (대화 순서) */
export function searchMessages(messages: Message[], q: string): Message[] {
  const query = q.trim();
  if (!query) return [];
  return messages.filter((m) => searchable(m) && textOf(m).includes(query));
}

/** 형광펜 표시용으로 본문을 검색어 기준으로 나눕니다. */
export function markParts(text: string, q: string): { text: string; mark: boolean }[] {
  const query = q.trim();
  if (!query) return [{ text, mark: false }];
  const out: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (let i = text.indexOf(query); i >= 0; i = text.indexOf(query, at)) {
    if (i > at) out.push({ text: text.slice(at, i), mark: false });
    out.push({ text: query, mark: true });
    at = i + query.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

export type FileHit = { room: Room; name: string; at: string };

/** 대화 탭 전체 검색: 메시지방·멤버 이름 / 메시지 / 파일, 모두 최신순 */
export function searchAll(q: string, userId: string, rooms: Room[], messages: Message[], users: User[]): { rooms: Room[]; messages: Message[]; files: FileHit[] } {
  const query = q.trim();
  if (!query) return { rooms: [], messages: [], files: [] };
  const mine = rooms.filter((r) => r.memberIds.includes(userId));
  const ids = new Set(mine.map((r) => r.id));
  const name = (id: string) => users.find((u) => u.id === id)?.nickname ?? '';
  const latest = (r: Room) => lastMessage(r, messages, userId)?.at ?? r.createdAt;
  return {
    rooms: mine.filter((r) => r.title.includes(query) || r.memberIds.some((id) => id !== userId && name(id).includes(query))).sort((a, b) => latest(b).localeCompare(latest(a))),
    messages: messages
      .filter((m) => ids.has(m.roomId) && searchable(m) && !m.deletedFor?.includes(userId) && textOf(m).includes(query))
      .sort((a, b) => b.at.localeCompare(a.at)),
    files: mine
      .flatMap((room) => (room.caseInfo?.documents ?? []).map((d, i) => ({ room, name: d.name, at: d.addedAt, i })))
      .filter((f) => f.name.includes(query))
      // 같은 시각이면 나중에 올린 서류가 위
      .sort((a, b) => b.at.localeCompare(a.at) || b.i - a.i)
      .map(({ room, name, at }) => ({ room, name, at })),
  };
}
