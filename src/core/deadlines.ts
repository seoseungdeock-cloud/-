// 불변기간 알림 (승덕 요청 2026-10-20).
// 3일 전 오전 9시 푸시, 하루 전 24시(만료일 0시)까지 조치 완료 표시가 없으면 변호사 전용 '불변기간' 게시판에 경고 글,
// 만료 다음 날 0시 도과 푸시. 받는 사람은 담당 변호사와 대표 계정. 실제 발송은 서버(enqueue_deadline_alerts)가 합니다.
import { dateLabel, dDay } from './hearings';
import type { BoardPost, DeadlineCase, FixedDeadline, Room, User } from './types';

export const LIMIT_BOT = 'bot_deadline';
export const LIMIT_BOT_NAME = '불변기간 알림';

/** 담당 변호사: 지정한 변호사, 없으면 사건방의 변호사 전원 */
export function limitLawyers(room: Room, d: Pick<FixedDeadline, 'lawyerId'>, users: User[]): User[] {
  if (d.lawyerId) return users.filter((u) => u.id === d.lawyerId);
  return users.filter((u) => u.role === 'lawyer' && room.memberIds.includes(u.id));
}

/** 경고 글 말머리: 담당 변호사의 사무소(지점, 없으면 부서) */
export function limitOffice(lawyers: User[]): string {
  const sorted = [...lawyers].sort((a, b) => Number(!a.branch?.trim()) - Number(!b.branch?.trim()) || a.nickname.localeCompare(b.nickname, 'ko'));
  return sorted.map((u) => u.branch?.trim() || u.dept?.trim()).find(Boolean) ?? '미지정';
}

/** 화면 표시: 조치 완료 / 도과 / 오늘 만료 / D-n */
export function limitStatus(d: FixedDeadline, now = new Date()): { label: string; tone: 'secure' | 'warn' | 'accent' } {
  if (d.handledAt) return { label: '조치 완료', tone: 'secure' };
  const n = dDay(d.due, now);
  if (n < 0) return { label: '도과', tone: 'warn' };
  if (n === 0) return { label: '오늘 만료', tone: 'warn' };
  return { label: `D-${n}`, tone: n <= 3 ? 'warn' : 'accent' };
}

export function limitWhen(d: Pick<FixedDeadline, 'due'>): string {
  return `${dateLabel(d.due)} 24:00 만료`;
}

/** 서버가 올리는 것과 같은 경고 글 */
export function limitPost(room: Room, d: FixedDeadline, users: User[], at: string): BoardPost {
  const lawyers = limitLawyers(room, d, users);
  const title = room.caseInfo?.title ?? room.title;
  return {
    id: `p_${d.id}`, board: 'deadline', authorId: LIMIT_BOT, field: '', at, votes: {}, comments: [], sourceId: `deadline:${d.id}`,
    title: `[${limitOffice(lawyers)}] 불변기간 오늘 만료 · ${title} ${d.label}`,
    body: `사건: ${title}\n불변기간: ${d.label} · ${limitWhen(d)}\n담당 변호사: ${lawyers.map((u) => u.nickname).join(', ') || '미지정'}\n\n만료 하루 전 24시까지 조치 완료 표시가 없어 자동으로 올린 글입니다.`,
  };
}

/** 기기 안(서버 없이)에서: 만료일이 된(또는 지난 7일 안) 조치 안 한 불변기간의 경고 글 중 아직 없는 것 */
export function dueLimitPosts(rooms: Room[], users: User[], posts: BoardPost[], now = new Date()): BoardPost[] {
  const have = new Set(posts.map((p) => p.sourceId).filter(Boolean));
  const out: BoardPost[] = [];
  for (const r of rooms) {
    if (!r.caseInfo || r.caseInfo.limitAlerts === false) continue;
    for (const d of r.caseInfo.limits ?? []) {
      const n = dDay(d.due, now);
      if (d.handledAt || n > 0 || n < -7 || have.has(`deadline:${d.id}`)) continue;
      out.push(limitPost(r, d, users, now.toISOString()));
    }
  }
  return out;
}

/** 어드민 화면: 사건별 불변기간 (서버는 admin_deadline_cases가 줌) */
export function deadlineCasesFrom(rooms: Room[], users: User[]): DeadlineCase[] {
  const next = (c: DeadlineCase) => c.limits.filter((d) => !d.handledAt).map((d) => d.due).sort()[0] ?? '9999';
  return rooms
    .filter((r) => r.caseInfo)
    .map((r) => ({
      roomId: r.id, title: r.caseInfo!.title, alertsOn: r.caseInfo!.limitAlerts !== false,
      office: limitOffice(limitLawyers(r, {}, users)),
      limits: [...(r.caseInfo!.limits ?? [])].sort((a, b) => a.due.localeCompare(b.due)),
    }))
    .sort((a, b) => next(a).localeCompare(next(b)) || a.title.localeCompare(b.title, 'ko'));
}
