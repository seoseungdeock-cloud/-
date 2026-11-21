// 업무 도구 상태 — 캘린더 일정·회의실·할 일·노트·고객 연락처·파일함 (네이버웍스에서 옮겨 온 기능).
// 메신저 상태(store.ts)와 분리된 작은 저장소입니다. 서버에 붙어 있으면 Supabase 표를 읽고 쓰고, 아니면 기기 안 목업으로 돕니다.
// 규칙 계산(겹침·반복·정렬)은 순수 함수로 두어 화면 없이 테스트합니다.
import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { newId, nowIso } from './ids';
import { storageName } from './remote';
import { supabase } from './supabase';
/** 파일함 저장소 버킷 */
export const DRIVE_BUCKET = 'drive';

export type EventScope = 'personal' | 'dept' | 'firm' | 'room';
export type AttendStatus = 'pending' | 'accepted' | 'declined' | 'tentative';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export type WorkEvent = {
  id: string;
  ownerId: string;
  title: string;
  /** ISO 시각 */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  place?: string;
  memo?: string;
  scope: EventScope;
  dept?: string;
  roomId?: string;
  resourceId?: string;
  recurrence: Recurrence;
  /** YYYY-MM-DD. 없으면 끝없이 반복 (화면은 1년까지만 펼침) */
  recurrenceUntil?: string;
  /** 매주 반복일 때 요일 (0=일 … 6=토). 비면 시작일 요일 */
  recurrenceDays?: number[];
  /** n주/n일/n달마다 (기본 1) */
  recurrenceInterval?: number;
  /** 건너뛰는 회차 (한국 날짜) */
  recurrenceExdates?: string[];
  /** 시작 n분 전 미리 알림 (여러 개) */
  reminders?: number[];
  /** 비공개: 주인·참석자 외에는 「바쁨」만 보임 */
  private?: boolean;
  createdAt: string;
};
export type Attendee = { eventId: string; userId: string; status: AttendStatus; optional?: boolean };
export type Resource = { id: string; name: string; kind: 'room' | 'equipment'; branch?: string; capacity?: number; active: boolean };
export type Task = {
  id: string;
  ownerId: string;
  /** 첫 담당자 (옛 열). 담당자 전체는 assignees */
  assigneeId?: string;
  /** 담당자 여러 명과 각자 끝낸 시각 */
  assignees?: { userId: string; doneAt?: string }[];
  /** any = 한 명만 끝내도 완료, all = 모두 끝내야 완료 */
  completion?: 'any' | 'all';
  title: string;
  detail?: string;
  dueDate?: string;
  dueTime?: string;
  /** 0 보통 · 1 중요 · 2 긴급 */
  priority: 0 | 1 | 2;
  categoryId?: string;
  roomId?: string;
  doneAt?: string;
  createdAt: string;
};
export type TaskCategory = { id: string; userId: string; name: string; sort: number };
/** 부서·회사·대화방이 함께 보는 메모 */
export type SharedNote = {
  id: string; scope: 'dept' | 'firm' | 'room'; dept?: string; roomId?: string;
  title: string; body: string; pinned: boolean; allowEdit: boolean;
  authorId: string; updatedBy?: string; createdAt: string; updatedAt: string;
};
/** 고객·거래처 연락처 */
export type PhoneKind = 'cell' | 'work' | 'home' | 'fax' | 'other';
export type Contact = {
  id: string; ownerId: string; shared: boolean; name: string; company?: string; title?: string;
  /** 대표 전화·메일 (phones/emails 의 primary). 옛 열과 호환 */
  phone?: string; email?: string;
  phones?: { type: PhoneKind; value: string; primary?: boolean }[];
  emails?: { value: string; primary?: boolean }[];
  address?: string; website?: string;
  /** shared=false 여도 이 부서 사람은 봄 */
  shareDepts?: string[];
  /** 공유 대상이 고칠 수 있나 (기본 참) */
  coEdit?: boolean;
  memo?: string; tags: string[]; createdAt: string; updatedAt: string;
};
/** 파일 외부 링크 */
export type DriveLink = { id: string; fileId: string; access: 'anyone' | 'firm'; permission: 'preview' | 'download'; expiresAt?: string; hasPassword: boolean; createdBy: string; createdAt: string; hits: number; lastHitAt?: string; revokedAt?: string };

/** 파일함 한 칸. folder 는 '서식/민사' 처럼 '/' 로 이은 이름표 */
export type DriveFile = {
  id: string; scope: 'dept' | 'firm' | 'room'; dept?: string; roomId?: string; folder: string;
  name: string; size: number; mime?: string; path: string; uploaderId: string; createdAt: string;
  /** 휴지통에 들어간 시각 (30일 뒤 삭제) */
  deletedAt?: string;
  /** 목업·막 올린 파일의 기기 안 주소 */
  uri?: string;
};

export type WorkState = {
  loaded: boolean;
  events: WorkEvent[];
  attendees: Attendee[];
  resources: Resource[];
  tasks: Task[];
  categories: TaskCategory[];
  notes: SharedNote[];
  contacts: Contact[];
  files: DriveFile[];
  links: DriveLink[];
  error?: string;
};

export type Check = { ok: true } | { ok: false; reason: string };
const ok: Check = { ok: true };

// ───────────────────────── 순수 규칙 ─────────────────────────
const DAY = 86_400_000;
/** 한국 시간 날짜 (YYYY-MM-DD) */
export function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}
/** 한국 시간 'HH:MM' */
export function kstTime(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(11, 16);
}
/** 한국 시간 날짜+시각 → ISO */
export function kstIso(date: string, time = '00:00'): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}
function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
}
function addMonths(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** 반복 일정을 [from, to] 날짜 범위 안의 회차로 펼칩니다. 회차 id 는 `원본id@날짜`. */
export function occurrences(e: WorkEvent, from: string, to: string): WorkEvent[] {
  const startDate = kstDate(e.startsAt);
  const span = new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime();
  if (e.recurrence === 'none') return startDate >= from && startDate <= to ? [e] : kstDate(e.endsAt) >= from && startDate <= to ? [e] : [];
  const until = e.recurrenceUntil && e.recurrenceUntil < to ? e.recurrenceUntil : to;
  const step = Math.max(1, e.recurrenceInterval ?? 1);
  const skip = new Set(e.recurrenceExdates ?? []);
  const out: WorkEvent[] = [];
  const push = (d: string) => {
    if (d < from || d < startDate || skip.has(d)) return;
    const startsAt = new Date(new Date(e.startsAt).getTime() + (new Date(`${d}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime())).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + span).toISOString();
    out.push({ ...e, id: d === startDate ? e.id : `${e.id}@${d}`, startsAt, endsAt });
  };
  let guard = 0;
  if (e.recurrence === 'weekly' && e.recurrenceDays?.length) {
    // 시작일이 든 주(일요일부터)에서 지정 요일마다, step 주 간격
    let week = addDays(startDate, -new Date(`${startDate}T00:00:00Z`).getUTCDay());
    while (week <= until && guard++ < 400) {
      for (const dow of [...e.recurrenceDays].sort()) { const d = addDays(week, dow); if (d <= until) push(d); }
      week = addDays(week, 7 * step);
    }
    return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  let d = startDate;
  while (d <= until && guard++ < 400) {
    push(d);
    d = e.recurrence === 'daily' ? addDays(d, step) : e.recurrence === 'weekly' ? addDays(d, 7 * step) : addMonths(d, step);
  }
  return out;
}
/** 할 일이 끝났는지: 담당자가 여럿이면 완료 조건으로 판단 */
export function taskDone(t: Task): boolean {
  if (!t.assignees?.length) return !!t.doneAt;
  const done = t.assignees.filter((a) => a.doneAt).length;
  return t.completion === 'all' ? done === t.assignees.length : done > 0;
}
/** 연락처의 대표 전화·메일 */
export const primaryPhone = (c: Contact) => c.phones?.find((p) => p.primary)?.value ?? c.phones?.[0]?.value ?? c.phone;
export const primaryEmail = (c: Contact) => c.emails?.find((p) => p.primary)?.value ?? c.emails?.[0]?.value ?? c.email;
/** 연락처를 볼 수 있나: 내 것 · 회사 공용 · 내 부서에 공유 */
export function canSeeContact(c: Contact, me: { id: string; dept?: string; firm?: boolean }): boolean {
  return c.ownerId === me.id || (!!me.firm && (c.shared || (!!me.dept && (c.shareDepts ?? []).includes(me.dept))));
}
/** 회차 id 에서 원본 id */
export const baseId = (id: string) => id.split('@')[0];

/** 어떤 사람이 볼 일정: 내 것 · 참석자 · 부서 공유(내 부서) · 회사 공유 · 내 대화방 일정 */
export function visibleEvents(s: Pick<WorkState, 'events' | 'attendees'>, me: { id: string; dept?: string; firm?: boolean }, myRoomIds: Set<string>): WorkEvent[] {
  const mine = new Set(s.attendees.filter((a) => a.userId === me.id).map((a) => a.eventId));
  return s.events.filter((e) =>
    e.ownerId === me.id || mine.has(e.id) || (e.scope === 'firm' && me.firm) || (e.scope === 'dept' && me.firm && e.dept === me.dept) || (e.scope === 'room' && !!e.roomId && myRoomIds.has(e.roomId)),
  );
}

/** 어떤 사람이 볼 노트: 내 것 · 부서 · 회사 · 내 대화방. 고정된 것 먼저, 최근 수정 순 */
export function visibleNotes(notes: SharedNote[], me: { id: string; dept?: string; firm?: boolean }, myRoomIds: Set<string>): SharedNote[] {
  return notes
    .filter((n) => n.authorId === me.id || (n.scope === 'firm' && me.firm) || (n.scope === 'dept' && me.firm && n.dept === me.dept) || (n.scope === 'room' && !!n.roomId && myRoomIds.has(n.roomId)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}
/** 연락처 검색: 이름·회사·직함·전화·이메일·태그 */
/** 파일함: 내가 볼 수 있는 파일 (노트와 같은 규칙) */
export function visibleFiles(files: DriveFile[], me: { id: string; dept?: string; firm?: boolean }, myRoomIds: Set<string>): DriveFile[] {
  return files.filter((f) => !f.deletedAt && (f.uploaderId === me.id || (f.scope === 'firm' && me.firm) || (f.scope === 'dept' && me.firm && f.dept === me.dept) || (f.scope === 'room' && !!f.roomId && myRoomIds.has(f.roomId))));
}
/** 휴지통: 내가 지운(올린) 파일. 30일 뒤 자동 삭제 */
export function trashFiles(files: DriveFile[], meId: string, admin = false): DriveFile[] {
  return files.filter((f) => f.deletedAt && (admin || f.uploaderId === meId)).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
}
export const TRASH_DAYS = 30;
/** 폴더 이름표 정리: 앞뒤 '/'·공백 제거, 빈 조각 삭제 */
export function cleanFolder(folder: string): string {
  return folder.split('/').map((x) => x.trim()).filter(Boolean).join('/');
}
/** 한 폴더 안의 하위 폴더 이름(중복 없이)과 그 폴더에 바로 든 파일 */
export function folderView(files: DriveFile[], folder: string): { folders: string[]; files: DriveFile[] } {
  const base = cleanFolder(folder);
  const prefix = base ? `${base}/` : '';
  const folders = new Set<string>();
  const direct: DriveFile[] = [];
  for (const f of files) {
    if (f.folder === base) direct.push(f);
    else if (f.folder.startsWith(prefix)) folders.add(f.folder.slice(prefix.length).split('/')[0]);
  }
  return { folders: [...folders].sort((a, b) => a.localeCompare(b, 'ko')), files: direct.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}
export function fileSizeText(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function searchContacts(contacts: Contact[], q: string, tag?: string): Contact[] {
  const k = q.trim().toLowerCase();
  return contacts.filter((c) => (!tag || c.tags.includes(tag)) && (!k || [c.name, c.company, c.title, c.phone, c.email, c.memo, c.address, ...(c.phones ?? []).map((p) => p.value), ...(c.emails ?? []).map((p) => p.value), ...c.tags].some((v) => v?.toLowerCase().includes(k))));
}

/** 회의실 겹침: 같은 회의실에 시간이 겹치는 다른 일정 */
export function resourceConflicts(events: WorkEvent[], resourceId: string, startsAt: string, endsAt: string, exceptId?: string): WorkEvent[] {
  const s = new Date(startsAt).getTime();
  const en = new Date(endsAt).getTime();
  const from = kstDate(startsAt);
  const to = kstDate(endsAt);
  return events
    .filter((e) => e.resourceId === resourceId && baseId(e.id) !== (exceptId ? baseId(exceptId) : ''))
    .flatMap((e) => occurrences(e, addDays(from, -1), addDays(to, 1)))
    .filter((o) => new Date(o.startsAt).getTime() < en && new Date(o.endsAt).getTime() > s);
}

/** 할 일 정렬: 미완료 먼저(기한 빠른 순, 기한 없는 것은 뒤, 같은 날은 긴급 먼저) → 완료는 최근 완료 먼저 */
export function sortTasks(tasks: Task[]): Task[] {
  const key = (t: Task) => `${t.dueDate ?? '9999-99-99'} ${t.dueTime ?? '99:99'} ${2 - t.priority}`;
  return [...tasks].sort((a, b) => {
    if (!!a.doneAt !== !!b.doneAt) return a.doneAt ? 1 : -1;
    if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
    return key(a).localeCompare(key(b)) || a.createdAt.localeCompare(b.createdAt);
  });
}
/** 기한 상태: overdue(지남) · today · soon(3일 안) · later · none */
export function dueState(t: Task, today: string): 'overdue' | 'today' | 'soon' | 'later' | 'none' {
  if (!t.dueDate || t.doneAt) return 'none';
  if (t.dueDate < today) return 'overdue';
  if (t.dueDate === today) return 'today';
  return t.dueDate <= addDays(today, 3) ? 'soon' : 'later';
}

// ───────────────────────── 상태 ─────────────────────────
const listeners = new Set<() => void>();
const EMPTY: WorkState = { loaded: false, events: [], attendees: [], resources: [], tasks: [], categories: [], notes: [], contacts: [], files: [], links: [] };
let state: WorkState = EMPTY;
function set(patch: Partial<WorkState> | ((s: WorkState) => Partial<WorkState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
export function useWork(): WorkState {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => state);
}
export const workState = () => state;

// ---- 목업 ----
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const kstDay = (n: number) => new Date(Date.now() + 9 * 3_600_000 + n * DAY).toISOString().slice(0, 10);
function mockSeed(meId: string): Partial<WorkState> {
  const resources: Resource[] = [
    { id: 'rs_1', name: '본사 대회의실', kind: 'room', branch: '본사(여의도)', capacity: 20, active: true },
    { id: 'rs_2', name: '본사 소회의실 A', kind: 'room', branch: '본사(여의도)', capacity: 6, active: true },
    { id: 'rs_3', name: '부산 회의실', kind: 'room', branch: '부산', capacity: 10, active: true },
  ];
  const events: WorkEvent[] = [
    { id: 'ev_1', ownerId: 'u_admin', title: '주간 경영회의', startsAt: kstIso(kstDay(1), '09:30'), endsAt: kstIso(kstDay(1), '10:30'), allDay: false, place: '본사 대회의실', scope: 'firm', resourceId: 'rs_1', recurrence: 'weekly', reminders: [10, 1440], createdAt: ago(200) },
    { id: 'ev_5', ownerId: 'u_lawyer', title: '상담팀 스탠드업', startsAt: kstIso(kstDay(0), '09:00'), endsAt: kstIso(kstDay(0), '09:15'), allDay: false, scope: 'dept', dept: '부산총괄본부', recurrence: 'weekly', recurrenceDays: [1, 3, 5], reminders: [0], createdAt: ago(500) },
    { id: 'ev_6', ownerId: 'u_m1', title: '개인 일정', startsAt: kstIso(kstDay(3), '13:00'), endsAt: kstIso(kstDay(3), '14:00'), allDay: false, scope: 'dept', dept: '부산총괄본부', recurrence: 'none', private: true, createdAt: ago(10) },
    { id: 'ev_2', ownerId: 'u_m1', title: '상담팀 월례 교육', startsAt: kstIso(kstDay(4), '14:00'), endsAt: kstIso(kstDay(4), '16:00'), allDay: false, place: '부산 회의실', memo: '신규 상담 절차 안내', scope: 'dept', dept: '부산총괄본부', resourceId: 'rs_3', recurrence: 'monthly', createdAt: ago(300) },
    { id: 'ev_3', ownerId: meId, title: '의뢰인 미팅 — 임대차 사건', startsAt: kstIso(kstDay(2), '11:00'), endsAt: kstIso(kstDay(2), '12:00'), allDay: false, place: '본사 소회의실 A', scope: 'personal', resourceId: 'rs_2', recurrence: 'none', createdAt: ago(20) },
    { id: 'ev_4', ownerId: 'u_admin', title: '창립기념일 (휴무)', startsAt: kstIso(kstDay(12)), endsAt: kstIso(kstDay(12), '23:59'), allDay: true, scope: 'firm', recurrence: 'none', createdAt: ago(900) },
  ];
  const attendees: Attendee[] = [
    { eventId: 'ev_1', userId: 'u_lawyer', status: 'accepted' }, { eventId: 'ev_1', userId: 'u_m1', status: 'pending' },
    { eventId: 'ev_3', userId: 'u_lawyer', status: 'accepted' },
  ];
  const tasks: Task[] = [
    { id: 'tk_1', ownerId: meId, assigneeId: meId, title: '임대차보증금 사건 소장 초안', dueDate: kstDay(1), priority: 2, createdAt: ago(30) },
    { id: 'tk_2', ownerId: 'u_admin', assigneeId: meId, title: '조정기일 출석 안내문 발송 확인', detail: '민준 의뢰인 등기 발송 여부', dueDate: kstDay(0), dueTime: '15:00', priority: 1, roomId: 'r_case2', createdAt: ago(10) },
    { id: 'tk_3', ownerId: meId, assigneeId: 'u_staff', assignees: [{ userId: 'u_staff' }, { userId: 'u_m1', doneAt: ago(1) }], completion: 'all', title: '증거자료 사본 정리', dueDate: kstDay(5), priority: 0, createdAt: ago(50) },
    { id: 'tk_4', ownerId: meId, assigneeId: meId, title: '상담 일정표 확인', dueDate: kstDay(-1), priority: 0, doneAt: ago(2), createdAt: ago(80) },
  ];
  const notes: SharedNote[] = [
    { id: 'nt_1', scope: 'firm', title: '사건방 운영 원칙', body: '1. 의뢰인 메시지는 당일 답장\n2. 기일 변경은 봇 알림 확인 후 「확인했습니다」\n3. 사건 자료는 방 안 파일함에', pinned: true, allowEdit: false, authorId: 'u_admin', createdAt: ago(400), updatedAt: ago(100) },
    { id: 'nt_2', scope: 'dept', dept: '부산총괄본부', title: '상담팀 당직표 (11월)', body: '월 샘플 매니저 / 화 사무국 직원 / 수 샘플 변호사 A / 목·금 순환', pinned: false, allowEdit: true, authorId: 'u_m1', createdAt: ago(300), updatedAt: ago(40) },
    { id: 'nt_3', scope: 'room', roomId: 'r_case2', title: '교통사고 사건 쟁점 정리', body: '· 과실비율 70:30 주장\n· 후유장해 진단 대기\n· 보험사 제시액 1,200만 원 → 조정기일에서 조율', pinned: false, allowEdit: true, authorId: meId, createdAt: ago(60), updatedAt: ago(5) },
  ];
  const contacts: Contact[] = [
    { id: 'ct_1', ownerId: meId, shared: true, name: '김보험', company: '○○화재 보상팀', title: '대리', phone: '02-000-1111', email: 'claims@example.com', phones: [{ type: 'work', value: '02-000-1111', primary: true }, { type: 'cell', value: '010-0000-1111' }], emails: [{ value: 'claims@example.com', primary: true }], tags: ['보험사', '교통사고'], createdAt: ago(500), updatedAt: ago(500) },
    { id: 'ct_4', ownerId: 'u_m1', shared: false, shareDepts: ['부산총괄본부'], name: '최배달', company: '부산 퀵서비스', phones: [{ type: 'cell', value: '010-0000-4444', primary: true }], tags: ['배송'], createdAt: ago(100), updatedAt: ago(100) },
    { id: 'ct_2', ownerId: 'u_staff', shared: true, name: '박서기', company: '예시지방법원 민사3단독', title: '참여관', phone: '02-000-2222', tags: ['법원'], createdAt: ago(900), updatedAt: ago(900) },
    { id: 'ct_3', ownerId: meId, shared: false, name: '이감정', company: '한국감정평가', title: '평가사', phone: '010-0000-3333', memo: '부동산 시가 감정 의뢰처', tags: ['감정'], createdAt: ago(200), updatedAt: ago(200) },
  ];
  const files: DriveFile[] = [
    { id: 'df_1', scope: 'firm', folder: '사내 규정', name: '취업규칙(2026 개정).pdf', size: 482_000, mime: 'application/pdf', path: 'df_1/취업규칙.pdf', uploaderId: 'u_admin', createdAt: ago(900) },
    { id: 'df_2', scope: 'firm', folder: '사내 규정', name: '정보보호 지침.pdf', size: 120_000, mime: 'application/pdf', path: 'df_2/정보보호.pdf', uploaderId: 'u_admin', createdAt: ago(800) },
    { id: 'df_3', scope: 'firm', folder: '서식/소송', name: '소장 표준 서식.docx', size: 64_000, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path: 'df_3/소장.docx', uploaderId: 'u_lawyer', createdAt: ago(700) },
    { id: 'df_4', scope: 'firm', folder: '서식/소송', name: '답변서 표준 서식.docx', size: 58_000, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path: 'df_4/답변서.docx', uploaderId: 'u_lawyer', createdAt: ago(650) },
    { id: 'df_5', scope: 'firm', folder: '서식/계약', name: '위임계약서.hwp', size: 90_000, path: 'df_5/위임계약서.hwp', uploaderId: 'u_staff', createdAt: ago(600) },
    { id: 'df_6', scope: 'dept', dept: '부산총괄본부', folder: '', name: '상담 응대 매뉴얼 v3.pdf', size: 2_300_000, mime: 'application/pdf', path: 'df_6/매뉴얼.pdf', uploaderId: 'u_m1', createdAt: ago(300) },
    { id: 'df_7', scope: 'dept', dept: '부산총괄본부', folder: '당직', name: '11월 당직표.xlsx', size: 22_000, path: 'df_7/당직표.xlsx', uploaderId: 'u_m1', createdAt: ago(120) },
    { id: 'df_8', scope: 'room', roomId: 'r_case2', folder: '', name: '교통사고 사실확인원.pdf', size: 410_000, mime: 'application/pdf', path: 'df_8/사실확인원.pdf', uploaderId: meId, createdAt: ago(40) },
    { id: 'df_9', scope: 'firm', folder: '서식/소송', name: '(구) 소장 서식 2024.docx', size: 61_000, path: 'df_9/old.docx', uploaderId: meId, createdAt: ago(3000), deletedAt: ago(48) },
  ];
  return { events, attendees, resources, tasks, notes, contacts, files, links: [], categories: [{ id: 'tc_1', userId: meId, name: '사건', sort: 0 }, { id: 'tc_2', userId: meId, name: '사무', sort: 1 }] };
}

// ---- 서버 ----
type Row = Record<string, any>;
const opt = (v: unknown) => (v === null || v === undefined ? undefined : (v as string));
const rowEvent = (r: Row): WorkEvent => ({
  id: r.id, ownerId: r.owner_id, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at, allDay: !!r.all_day, place: opt(r.place), memo: opt(r.memo),
  scope: r.scope, dept: opt(r.dept), roomId: opt(r.room_id), resourceId: opt(r.resource_id), recurrence: r.recurrence, recurrenceUntil: opt(r.recurrence_until), createdAt: r.created_at,
  recurrenceDays: r.recurrence_days?.length ? r.recurrence_days : undefined, recurrenceInterval: r.recurrence_interval ?? 1, recurrenceExdates: r.recurrence_exdates?.length ? r.recurrence_exdates : undefined,
  reminders: r.reminders?.length ? r.reminders : undefined, private: !!r.private,
});
const eventRow = (e: WorkEvent): Row => ({
  id: e.id, owner_id: e.ownerId, title: e.title, starts_at: e.startsAt, ends_at: e.endsAt, all_day: e.allDay, place: e.place ?? null, memo: e.memo ?? null,
  scope: e.scope, dept: e.dept ?? null, room_id: e.roomId ?? null, resource_id: e.resourceId ?? null, recurrence: e.recurrence, recurrence_until: e.recurrenceUntil ?? null,
  recurrence_days: e.recurrenceDays ?? [], recurrence_interval: e.recurrenceInterval ?? 1, recurrence_exdates: e.recurrenceExdates ?? [], reminders: e.reminders ?? [], private: !!e.private,
});
const rowTask = (r: Row): Task => ({
  id: r.id, ownerId: r.owner_id, assigneeId: opt(r.assignee_id), title: r.title, detail: opt(r.detail), dueDate: opt(r.due_date), dueTime: r.due_time ? String(r.due_time).slice(0, 5) : undefined,
  priority: r.priority ?? 0, categoryId: opt(r.category_id), roomId: opt(r.room_id), doneAt: opt(r.done_at), createdAt: r.created_at, completion: r.completion ?? 'any',
});
const taskRow = (t: Task): Row => ({
  id: t.id, owner_id: t.ownerId, assignee_id: t.assigneeId ?? null, title: t.title, detail: t.detail ?? null, due_date: t.dueDate ?? null, due_time: t.dueTime ?? null,
  priority: t.priority, category_id: t.categoryId ?? null, room_id: t.roomId ?? null, done_at: t.doneAt ?? null, completion: t.completion ?? 'any',
});

const rowNote = (r: Row): SharedNote => ({ id: r.id, scope: r.scope, dept: opt(r.dept), roomId: opt(r.room_id), title: r.title, body: r.body ?? '', pinned: !!r.pinned, allowEdit: !!r.allow_edit, authorId: r.author_id, updatedBy: opt(r.updated_by), createdAt: r.created_at, updatedAt: r.updated_at });
const noteRow = (n: SharedNote): Row => ({ id: n.id, scope: n.scope, dept: n.dept ?? null, room_id: n.roomId ?? null, title: n.title, body: n.body, pinned: n.pinned, allow_edit: n.allowEdit, author_id: n.authorId });
const rowContact = (r: Row): Contact => ({
  id: r.id, ownerId: r.owner_id, shared: !!r.shared, name: r.name, company: opt(r.company), title: opt(r.title), phone: opt(r.phone), email: opt(r.email), memo: opt(r.memo), tags: r.tags ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
  phones: Array.isArray(r.phones) && r.phones.length ? r.phones : undefined, emails: Array.isArray(r.emails) && r.emails.length ? r.emails : undefined,
  address: opt(r.address), website: opt(r.website), shareDepts: r.share_depts?.length ? r.share_depts : undefined, coEdit: r.co_edit !== false,
});
const rowLink = (r: Row): DriveLink => ({ id: r.id, fileId: r.file_id, access: r.access, permission: r.permission, expiresAt: opt(r.expires_at), hasPassword: !!r.password_hash, createdBy: r.created_by, createdAt: r.created_at, hits: r.hits ?? 0, lastHitAt: opt(r.last_hit_at), revokedAt: opt(r.revoked_at) });
const rowFile = (r: Row): DriveFile => ({ id: r.id, scope: r.scope, dept: opt(r.dept), roomId: opt(r.room_id), folder: r.folder ?? '', name: r.name, size: Number(r.size ?? 0), mime: opt(r.mime), path: r.path, uploaderId: r.uploader_id, createdAt: r.created_at, deletedAt: opt(r.deleted_at) });
const contactRow = (c: Contact): Row => ({
  id: c.id, owner_id: c.ownerId, shared: c.shared, name: c.name, company: c.company ?? null, title: c.title ?? null, phone: primaryPhone(c) ?? null, email: primaryEmail(c) ?? null, memo: c.memo ?? null, tags: c.tags,
  phones: c.phones ?? [], emails: c.emails ?? [], address: c.address ?? null, website: c.website ?? null, share_depts: c.shareDepts ?? [], co_edit: c.coEdit !== false,
});

let live: RealtimeChannel | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
let currentUser: string | null = null;

async function loadServer(): Promise<void> {
  const sb = supabase!;
  const [ev, at, rs, tk, tc, nt, ct, df, ta, dl] = await Promise.all([
    sb.from('events').select('*').order('starts_at'),
    sb.from('event_attendees').select('*'),
    sb.from('resources').select('*').order('name'),
    sb.from('tasks').select('*').order('created_at'),
    sb.from('task_categories').select('*').order('sort'),
    sb.from('shared_notes').select('*').order('updated_at', { ascending: false }),
    sb.from('contacts').select('*').order('name'),
    sb.from('drive_files').select('*').order('created_at', { ascending: false }),
    sb.from('task_assignees').select('*'),
    sb.from('drive_links').select('id, file_id, access, permission, expires_at, password_hash, created_by, created_at, hits, last_hit_at, revoked_at'),
  ]);
  const err = [ev, at, rs, tk, tc, nt, ct, df, ta, dl].find((r) => r.error)?.error;
  const byTask = new Map<string, { userId: string; doneAt?: string }[]>();
  for (const a of (ta.data ?? []) as Row[]) byTask.set(a.task_id, [...(byTask.get(a.task_id) ?? []), { userId: a.user_id, doneAt: opt(a.done_at) }]);
  if (err) throw err;
  set({
    loaded: true, error: undefined,
    events: (ev.data ?? []).map(rowEvent),
    attendees: (at.data ?? []).map((r: Row) => ({ eventId: r.event_id, userId: r.user_id, status: r.status, optional: !!r.optional })),
    resources: (rs.data ?? []).map((r: Row) => ({ id: r.id, name: r.name, kind: r.kind, branch: opt(r.branch), capacity: r.capacity ?? undefined, active: !!r.active })),
    tasks: (tk.data ?? []).map((r: Row) => ({ ...rowTask(r), assignees: byTask.get(r.id) })),
    categories: (tc.data ?? []).map((r: Row) => ({ id: r.id, userId: r.user_id, name: r.name, sort: r.sort })),
    notes: (nt.data ?? []).map(rowNote),
    contacts: (ct.data ?? []).map(rowContact),
    files: (df.data ?? []).map(rowFile),
    links: (dl.data ?? []).map(rowLink),
  });
}
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void loadServer().catch((e) => set({ error: String(e?.message ?? e) })), 300);
}

/** 로그인 뒤 한 번 부릅니다 (store 가 부름). 로그아웃이면 userId=null. */
export async function startWork(userId: string | null): Promise<void> {
  currentUser = userId;
  if (!userId) {
    if (live) { void live.unsubscribe(); live = null; }
    set(EMPTY);
    return;
  }
  if (!supabase) {
    set({ loaded: true, ...mockSeed(userId) });
    return;
  }
  try {
    await loadServer();
  } catch (e) {
    set({ loaded: true, error: String((e as Error)?.message ?? e) });
  }
  if (!live) {
    const sb = supabase;
    const token = (await sb.auth.getSession()).data.session?.access_token;
    if (token) await sb.realtime.setAuth(token);
    const ch = sb.channel('skynet-work');
    for (const t of ['events', 'event_attendees', 'tasks', 'resources', 'task_categories', 'shared_notes', 'contacts', 'drive_files', 'task_assignees', 'drive_links']) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleReload);
    live = ch.subscribe((st) => { if (st === 'SUBSCRIBED') scheduleReload(); });
  }
}

/** 서버에 쓰고, 실패하면 다시 읽어 되돌립니다 */
async function write(op: () => PromiseLike<{ error: { message: string } | null }>): Promise<Check> {
  if (!supabase) return ok;
  const { error } = await op();
  if (error) {
    scheduleReload();
    return { ok: false, reason: /예약된 회의실/.test(error.message) ? '그 시간에 이미 예약된 회의실입니다.' : error.message };
  }
  return ok;
}
function me(): string {
  if (!currentUser) throw new Error('로그인이 필요합니다');
  return currentUser;
}

// ───────────────────────── 동작 ─────────────────────────
export type EventInput = Omit<WorkEvent, 'id' | 'ownerId' | 'createdAt'> & { attendeeIds?: string[]; optionalIds?: string[] };

export const work = {
  async createEvent(input: EventInput): Promise<Check & { id?: string }> {
    const uid = me();
    if (!input.title.trim()) return { ok: false, reason: '제목을 적어 주세요.' };
    if (new Date(input.endsAt) < new Date(input.startsAt)) return { ok: false, reason: '끝나는 시각이 시작보다 빠릅니다.' };
    if (input.resourceId && resourceConflicts(state.events, input.resourceId, input.startsAt, input.endsAt).length) return { ok: false, reason: '그 시간에 이미 예약된 회의실입니다.' };
    const e: WorkEvent = { ...input, title: input.title.trim(), id: newId('ev'), ownerId: uid, createdAt: nowIso() };
    const ids = (input.attendeeIds ?? []).filter((x) => x !== uid);
    const att: Attendee[] = ids.map((userId) => ({ eventId: e.id, userId, status: 'pending', optional: input.optionalIds?.includes(userId) }));
    set((s) => ({ events: [...s.events, e], attendees: [...s.attendees, ...att] }));
    const r = await write(async () => {
      const { error } = await supabase!.from('events').insert(eventRow(e));
      if (error || !att.length) return { error };
      return supabase!.from('event_attendees').insert(att.map((a) => ({ event_id: a.eventId, user_id: a.userId, status: a.status, optional: !!a.optional })));
    });
    return r.ok ? { ok: true, id: e.id } : r;
  },
  async updateEvent(id: string, patch: Partial<EventInput>): Promise<Check> {
    const uid = me();
    const cur = state.events.find((e) => e.id === baseId(id));
    if (!cur) return { ok: false, reason: '일정을 찾을 수 없습니다.' };
    if (cur.ownerId !== uid) return { ok: false, reason: '만든 사람만 고칠 수 있습니다.' };
    const next: WorkEvent = { ...cur, ...patch, title: (patch.title ?? cur.title).trim() };
    if (next.resourceId && resourceConflicts(state.events, next.resourceId, next.startsAt, next.endsAt, cur.id).length) return { ok: false, reason: '그 시간에 이미 예약된 회의실입니다.' };
    const ids = patch.attendeeIds?.filter((x) => x !== uid);
    set((s) => ({
      events: s.events.map((e) => (e.id === cur.id ? next : e)),
      attendees: ids ? [...s.attendees.filter((a) => a.eventId !== cur.id), ...ids.map((userId) => ({ eventId: cur.id, userId, status: s.attendees.find((a) => a.eventId === cur.id && a.userId === userId)?.status ?? 'pending' as AttendStatus, optional: patch.optionalIds?.includes(userId) }))] : s.attendees,
    }));
    return write(async () => {
      const { error } = await supabase!.from('events').update(eventRow(next)).eq('id', cur.id);
      if (error || !ids) return { error };
      const { error: de } = await supabase!.from('event_attendees').delete().eq('event_id', cur.id);
      if (de || !ids.length) return { error: de };
      return supabase!.from('event_attendees').insert(ids.map((userId) => ({ event_id: cur.id, user_id: userId, status: state.attendees.find((a) => a.eventId === cur.id && a.userId === userId)?.status ?? 'pending', optional: !!patch.optionalIds?.includes(userId) })));
    });
  },
  /** 반복 일정의 이 회차만 건너뛰기 (주인) */
  async skipOccurrence(occurrenceId: string): Promise<Check> {
    const cur = state.events.find((e) => e.id === baseId(occurrenceId));
    if (!cur) return { ok: false, reason: '일정을 찾을 수 없습니다.' };
    if (cur.recurrence === 'none') return { ok: false, reason: '반복 일정이 아닙니다.' };
    const day = occurrenceId.includes('@') ? occurrenceId.split('@')[1] : kstDate(cur.startsAt);
    return work.updateEvent(cur.id, { recurrenceExdates: [...new Set([...(cur.recurrenceExdates ?? []), day])] });
  },
  async deleteEvent(id: string): Promise<Check> {
    const uid = me();
    const cur = state.events.find((e) => e.id === baseId(id));
    if (!cur) return { ok: false, reason: '일정을 찾을 수 없습니다.' };
    if (cur.ownerId !== uid) return { ok: false, reason: '만든 사람만 지울 수 있습니다.' };
    set((s) => ({ events: s.events.filter((e) => e.id !== cur.id), attendees: s.attendees.filter((a) => a.eventId !== cur.id) }));
    return write(() => supabase!.from('events').delete().eq('id', cur.id));
  },
  async respond(eventId: string, status: AttendStatus): Promise<Check> {
    const uid = me();
    const id = baseId(eventId);
    if (!state.attendees.some((a) => a.eventId === id && a.userId === uid)) return { ok: false, reason: '참석자로 초대된 일정이 아닙니다.' };
    set((s) => ({ attendees: s.attendees.map((a) => (a.eventId === id && a.userId === uid ? { ...a, status } : a)) }));
    return write(() => supabase!.from('event_attendees').update({ status }).eq('event_id', id).eq('user_id', uid));
  },
  // 회의실 (어드민)
  async saveResource(r: Omit<Resource, 'id'> & { id?: string }): Promise<Check> {
    me();
    if (!r.name.trim()) return { ok: false, reason: '이름을 적어 주세요.' };
    const res: Resource = { ...r, name: r.name.trim(), id: r.id ?? newId('rs') };
    set((s) => ({ resources: r.id ? s.resources.map((x) => (x.id === r.id ? res : x)) : [...s.resources, res] }));
    return write(() => supabase!.from('resources').upsert({ id: res.id, name: res.name, kind: res.kind, branch: res.branch ?? null, capacity: res.capacity ?? null, active: res.active }));
  },
  // 할 일
  async createTask(input: Omit<Task, 'id' | 'ownerId' | 'createdAt' | 'doneAt'> & { assigneeIds?: string[] }): Promise<Check & { id?: string }> {
    const uid = me();
    if (!input.title.trim()) return { ok: false, reason: '할 일을 적어 주세요.' };
    const ids = [...new Set((input.assigneeIds?.length ? input.assigneeIds : [input.assigneeId ?? uid]).filter(Boolean) as string[])];
    const { assigneeIds: _ids, ...rest } = input;
    const t: Task = { ...rest, title: input.title.trim(), id: newId('tk'), ownerId: uid, assigneeId: ids[0], assignees: ids.map((userId) => ({ userId })), completion: input.completion ?? 'any', createdAt: nowIso() };
    set((s) => ({ tasks: [...s.tasks, t] }));
    const r = await write(async () => {
      const { error } = await supabase!.from('tasks').insert(taskRow(t));
      if (error) return { error };
      return supabase!.from('task_assignees').insert(ids.map((userId) => ({ task_id: t.id, user_id: userId })));
    });
    return r.ok ? { ok: true, id: t.id } : r;
  },
  /** 담당자 바꾸기 (만든 사람) */
  async setAssignees(id: string, ids: string[]): Promise<Check> {
    const uid = me();
    const cur = state.tasks.find((t) => t.id === id);
    if (!cur) return { ok: false, reason: '할 일을 찾을 수 없습니다.' };
    if (cur.ownerId !== uid) return { ok: false, reason: '만든 사람만 담당자를 바꿀 수 있습니다.' };
    const uniq = [...new Set(ids)];
    if (!uniq.length) return { ok: false, reason: '담당자를 한 명 이상 골라 주세요.' };
    const assignees = uniq.map((userId) => ({ userId, doneAt: cur.assignees?.find((a) => a.userId === userId)?.doneAt }));
    const next: Task = { ...cur, assigneeId: uniq[0], assignees };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    return write(async () => {
      const { error } = await supabase!.from('tasks').update({ assignee_id: uniq[0] }).eq('id', id);
      if (error) return { error };
      const { error: de } = await supabase!.from('task_assignees').delete().eq('task_id', id).not('user_id', 'in', `(${uniq.join(',')})`);
      if (de) return { error: de };
      return supabase!.from('task_assignees').upsert(uniq.map((userId) => ({ task_id: id, user_id: userId })), { onConflict: 'task_id,user_id', ignoreDuplicates: true });
    });
  },
  /** 내 몫 끝내기/되돌리기 (담당자). 완료 조건에 따라 전체 완료가 정해짐 */
  async toggleMine(id: string): Promise<Check> {
    const uid = me();
    const cur = state.tasks.find((t) => t.id === id);
    if (!cur) return { ok: false, reason: '할 일을 찾을 수 없습니다.' };
    const mine = cur.assignees?.find((a) => a.userId === uid);
    if (!mine) return work.toggleTask(id);
    const doneAt = mine.doneAt ? undefined : nowIso();
    const assignees = cur.assignees!.map((a) => (a.userId === uid ? { ...a, doneAt } : a));
    const next: Task = { ...cur, assignees };
    next.doneAt = taskDone(next) ? (cur.doneAt ?? nowIso()) : undefined;
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    return write(() => supabase!.from('task_assignees').update({ done_at: doneAt ?? null }).eq('task_id', id).eq('user_id', uid));
  },
  async updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'ownerId' | 'createdAt'>>): Promise<Check> {
    const uid = me();
    const cur = state.tasks.find((t) => t.id === id);
    if (!cur) return { ok: false, reason: '할 일을 찾을 수 없습니다.' };
    if (cur.ownerId !== uid && cur.assigneeId !== uid && !cur.assignees?.some((a) => a.userId === uid)) return { ok: false, reason: '만든 사람이나 담당자만 고칠 수 있습니다.' };
    const next = { ...cur, ...patch };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    return write(() => supabase!.from('tasks').update(taskRow(next)).eq('id', id));
  },
  toggleTask(id: string): Promise<Check> {
    const cur = state.tasks.find((t) => t.id === id);
    const doneAt = cur?.doneAt ? undefined : nowIso();
    // 담당자 몫도 함께 맞춤 (만든 사람이 한 번에 끝내는 경우)
    if (cur?.assignees?.length) {
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, assignees: t.assignees!.map((a) => ({ ...a, doneAt })) } : t)) }));
      if (supabase) void supabase.from('task_assignees').update({ done_at: doneAt ?? null }).eq('task_id', id);
    }
    return work.updateTask(id, { doneAt });
  },
  async deleteTask(id: string): Promise<Check> {
    const uid = me();
    const cur = state.tasks.find((t) => t.id === id);
    if (!cur) return { ok: false, reason: '할 일을 찾을 수 없습니다.' };
    if (cur.ownerId !== uid) return { ok: false, reason: '만든 사람만 지울 수 있습니다.' };
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    return write(() => supabase!.from('tasks').delete().eq('id', id));
  },
  // 노트
  async saveNote(input: Omit<SharedNote, 'id' | 'authorId' | 'createdAt' | 'updatedAt' | 'updatedBy'> & { id?: string }): Promise<Check & { id?: string }> {
    const uid = me();
    if (!input.title.trim()) return { ok: false, reason: '제목을 적어 주세요.' };
    if (input.scope === 'dept' && !input.dept) return { ok: false, reason: '부서 정보가 없습니다.' };
    if (input.scope === 'room' && !input.roomId) return { ok: false, reason: '대화방을 골라 주세요.' };
    const cur = input.id ? state.notes.find((n) => n.id === input.id) : undefined;
    if (input.id && !cur) return { ok: false, reason: '노트를 찾을 수 없습니다.' };
    if (cur && cur.authorId !== uid && !cur.allowEdit) return { ok: false, reason: '글쓴이만 고칠 수 있는 노트입니다.' };
    const now = nowIso();
    const n: SharedNote = cur
      ? { ...cur, ...input, id: cur.id, title: input.title.trim(), updatedAt: now, updatedBy: uid }
      : { ...input, id: newId('nt'), title: input.title.trim(), authorId: uid, createdAt: now, updatedAt: now };
    set((s) => ({ notes: cur ? s.notes.map((x) => (x.id === n.id ? n : x)) : [n, ...s.notes] }));
    const r = await write(() => (cur ? supabase!.from('shared_notes').update({ title: n.title, body: n.body, pinned: n.pinned, allow_edit: n.allowEdit, scope: n.scope, dept: n.dept ?? null, room_id: n.roomId ?? null }).eq('id', n.id) : supabase!.from('shared_notes').insert(noteRow(n))));
    return r.ok ? { ok: true, id: n.id } : r;
  },
  async deleteNote(id: string): Promise<Check> {
    const uid = me();
    const cur = state.notes.find((n) => n.id === id);
    if (!cur) return { ok: false, reason: '노트를 찾을 수 없습니다.' };
    if (cur.authorId !== uid) return { ok: false, reason: '글쓴이만 지울 수 있습니다.' };
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    return write(() => supabase!.from('shared_notes').delete().eq('id', id));
  },
  // 고객·거래처 연락처
  async saveContact(input: Omit<Contact, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Check & { id?: string }> {
    const uid = me();
    if (!input.name.trim()) return { ok: false, reason: '이름을 적어 주세요.' };
    const phones = (input.phones ?? []).map((p) => ({ ...p, value: p.value.trim() })).filter((p) => p.value);
    const emails = (input.emails ?? []).map((p) => ({ ...p, value: p.value.trim() })).filter((p) => p.value);
    if (phones.length && !phones.some((p) => p.primary)) phones[0].primary = true;
    if (emails.length && !emails.some((p) => p.primary)) emails[0].primary = true;
    if (!phones.length && !emails.length && !input.phone?.trim() && !input.email?.trim()) return { ok: false, reason: '전화번호나 이메일 중 하나는 적어 주세요.' };
    input = { ...input, phones: phones.length ? phones : undefined, emails: emails.length ? emails : undefined, shareDepts: input.shareDepts?.filter(Boolean) };
    const cur = input.id ? state.contacts.find((c) => c.id === input.id) : undefined;
    if (input.id && !cur) return { ok: false, reason: '연락처를 찾을 수 없습니다.' };
    if (cur && cur.ownerId !== uid && (!(cur.shared || cur.shareDepts?.length) || cur.coEdit === false)) return { ok: false, reason: '만든 사람만 고칠 수 있습니다.' };
    const now = nowIso();
    const tags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))];
    const c: Contact = cur ? { ...cur, ...input, tags, id: cur.id, name: input.name.trim(), updatedAt: now } : { ...input, tags, id: newId('ct'), name: input.name.trim(), ownerId: uid, createdAt: now, updatedAt: now };
    set((s) => ({ contacts: cur ? s.contacts.map((x) => (x.id === c.id ? c : x)) : [...s.contacts, c].sort((a, b) => a.name.localeCompare(b.name, 'ko')) }));
    const r = await write(() => (cur ? supabase!.from('contacts').update(contactRow(c)).eq('id', c.id) : supabase!.from('contacts').insert(contactRow(c))));
    return r.ok ? { ok: true, id: c.id } : r;
  },
  async deleteContact(id: string): Promise<Check> {
    const uid = me();
    const cur = state.contacts.find((c) => c.id === id);
    if (!cur) return { ok: false, reason: '연락처를 찾을 수 없습니다.' };
    if (cur.ownerId !== uid) return { ok: false, reason: '만든 사람만 지울 수 있습니다.' };
    set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }));
    return write(() => supabase!.from('contacts').delete().eq('id', id));
  },
  // 파일함
  /** 파일 올리기: 명찰(drive_files)을 먼저 만들고 저장소에 올립니다. 올리기가 실패하면 명찰을 지웁니다. */
  async uploadFile(input: { scope: DriveFile['scope']; dept?: string; roomId?: string; folder: string; name: string; uri: string; size?: number; mime?: string }): Promise<Check & { id?: string }> {
    const uid = me();
    const name = input.name.trim().slice(0, 200);
    if (!name) return { ok: false, reason: '파일 이름이 없습니다.' };
    if (input.scope === 'dept' && !input.dept) return { ok: false, reason: '부서 정보가 없습니다.' };
    if (input.scope === 'room' && !input.roomId) return { ok: false, reason: '대화방을 골라 주세요.' };
    if ((input.size ?? 0) > 50 * 1024 * 1024) return { ok: false, reason: '파일은 50MB까지 올릴 수 있습니다.' };
    const id = newId('df');
    const f: DriveFile = { id, scope: input.scope, dept: input.dept, roomId: input.roomId, folder: cleanFolder(input.folder), name, size: input.size ?? 0, mime: input.mime, path: `${id}/${storageName(id, name)}`, uploaderId: uid, createdAt: nowIso(), uri: input.uri };
    set((s) => ({ files: [f, ...s.files] }));
    if (!supabase) return { ok: true, id };
    const sb = supabase;
    const { error } = await sb.from('drive_files').insert({ id: f.id, scope: f.scope, dept: f.dept ?? null, room_id: f.roomId ?? null, folder: f.folder, name: f.name, size: f.size, mime: f.mime ?? null, path: f.path, uploader_id: uid });
    if (error) { set((s) => ({ files: s.files.filter((x) => x.id !== id) })); return { ok: false, reason: error.message }; }
    try {
      const body = await (await fetch(input.uri)).arrayBuffer();
      const up = await sb.storage.from(DRIVE_BUCKET).upload(f.path, body, { contentType: f.mime ?? 'application/octet-stream', upsert: false });
      if (up.error) throw up.error;
    } catch (e) {
      await sb.from('drive_files').delete().eq('id', id);
      set((s) => ({ files: s.files.filter((x) => x.id !== id) }));
      const msg = String((e as Error)?.message ?? e);
      return { ok: false, reason: /exceeded|too large|size/i.test(msg) ? '파일은 50MB까지 올릴 수 있습니다.' : '파일을 올리지 못했습니다.' };
    }
    return { ok: true, id };
  },
  /** 이름·폴더 바꾸기 (올린 사람만) */
  async moveFile(id: string, patch: { name?: string; folder?: string }): Promise<Check> {
    const uid = me();
    const cur = state.files.find((f) => f.id === id);
    if (!cur) return { ok: false, reason: '파일을 찾을 수 없습니다.' };
    if (cur.uploaderId !== uid) return { ok: false, reason: '올린 사람만 바꿀 수 있습니다.' };
    const name = (patch.name ?? cur.name).trim().slice(0, 200);
    if (!name) return { ok: false, reason: '파일 이름이 없습니다.' };
    const next = { ...cur, name, folder: cleanFolder(patch.folder ?? cur.folder) };
    set((s) => ({ files: s.files.map((f) => (f.id === id ? next : f)) }));
    return write(() => supabase!.from('drive_files').update({ name: next.name, folder: next.folder }).eq('id', id));
  },
  /** 휴지통으로 (올린 사람). 30일 뒤 자동 삭제 */
  async deleteFile(id: string): Promise<Check> {
    const uid = me();
    const cur = state.files.find((f) => f.id === id);
    if (!cur) return { ok: false, reason: '파일을 찾을 수 없습니다.' };
    if (cur.uploaderId !== uid) return { ok: false, reason: '올린 사람만 지울 수 있습니다.' };
    const deletedAt = nowIso();
    set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, deletedAt } : f)) }));
    return write(() => supabase!.from('drive_files').update({ deleted_at: deletedAt, deleted_by: uid }).eq('id', id));
  },
  async restoreFile(id: string): Promise<Check> {
    me();
    const cur = state.files.find((f) => f.id === id);
    if (!cur?.deletedAt) return { ok: false, reason: '휴지통에 없는 파일입니다.' };
    set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, deletedAt: undefined } : f)) }));
    return write(() => supabase!.from('drive_files').update({ deleted_at: null, deleted_by: null }).eq('id', id));
  },
  /** 휴지통에서 바로 지우기 (되살릴 수 없음) */
  async purgeFile(id: string): Promise<Check> {
    me();
    const cur = state.files.find((f) => f.id === id);
    if (!cur?.deletedAt) return { ok: false, reason: '휴지통에 없는 파일입니다.' };
    set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
    return write(() => supabase!.from('drive_files').delete().eq('id', id));
  },
  /** 외부 링크 만들기 — 토큰은 이때 한 번만 받음 */
  async createLink(fileId: string, opts: { access?: 'anyone' | 'firm'; permission?: 'preview' | 'download'; expiresAt?: string; password?: string }): Promise<Check & { url?: string }> {
    const uid = me();
    const cur = state.files.find((f) => f.id === fileId);
    if (!cur) return { ok: false, reason: '파일을 찾을 수 없습니다.' };
    if (opts.password && (opts.password.length < 4 || opts.password.length > 16)) return { ok: false, reason: '비밀번호는 4~16자입니다.' };
    if (!supabase) {
      const l: DriveLink = { id: newId('dl'), fileId, access: opts.access ?? 'anyone', permission: opts.permission ?? 'download', expiresAt: opts.expiresAt, hasPassword: !!opts.password, createdBy: uid, createdAt: nowIso(), hits: 0 };
      set((s) => ({ links: [l, ...s.links] }));
      return { ok: true, url: `https://example.invalid/drive-link?t=skl_demo_${l.id}` };
    }
    const { data, error } = await supabase.rpc('create_drive_link', { p_file: fileId, p_access: opts.access ?? 'anyone', p_permission: opts.permission ?? 'download', p_expires_at: opts.expiresAt ?? null, p_password: opts.password ?? null });
    if (error) return { ok: false, reason: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    scheduleReload();
    return { ok: true, url: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/drive-link?t=${row.token}` };
  },
  async revokeLink(id: string): Promise<Check> {
    me();
    const at = nowIso();
    set((s) => ({ links: s.links.map((l) => (l.id === id ? { ...l, revokedAt: at } : l)) }));
    return write(() => supabase!.from('drive_links').update({ revoked_at: at }).eq('id', id));
  },
  /** 파일을 열거나 내려받았다고 감사 기록에 신고 (서버가 있을 때만) */
  logDownload(source: 'drive' | 'room' | 'board', path: string | undefined, name: string, roomId?: string): void {
    if (!supabase || !path) return;
    void supabase.rpc('log_file_download', { p_kind: source, p_path: path, p_name: name, p_room: roomId ?? null });
  },
  /** 내려받기 주소 (1시간짜리). 목업은 기기 안 주소 */
  async fileUrl(id: string): Promise<string | undefined> {
    const cur = state.files.find((f) => f.id === id);
    if (!cur) return undefined;
    if (!supabase) return cur.uri;
    if (cur.uri) return cur.uri;
    work.logDownload('drive', cur.path, cur.name, cur.roomId);
    const { data } = await supabase.storage.from(DRIVE_BUCKET).createSignedUrl(cur.path, 3600, { download: cur.name });
    return data?.signedUrl;
  },
  async addCategory(name: string): Promise<Check> {
    const uid = me();
    if (!name.trim()) return { ok: false, reason: '이름을 적어 주세요.' };
    const c: TaskCategory = { id: newId('tc'), userId: uid, name: name.trim(), sort: state.categories.length };
    set((s) => ({ categories: [...s.categories, c] }));
    return write(() => supabase!.from('task_categories').insert({ id: c.id, user_id: c.userId, name: c.name, sort: c.sort }));
  },
};

/** 테스트용: 상태를 직접 넣습니다 */
export function _setWorkState(patch: Partial<WorkState>, userId: string | null = 'u_test') {
  currentUser = userId;
  set({ ...EMPTY, loaded: true, ...patch });
}
