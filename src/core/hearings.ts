// 기일 업데이트 알람.
// 대륜탑(또는 변호사 입력)에서 기일이 새로 잡히거나 바뀌면 사건방에 알람 카드를 올리고, 방 공지로 고정하고,
// 의뢰인·변호사 모두 '확인했습니다'를 누를 때까지 앱 어디서나 알람 창을 띄웁니다.
// 서버가 붙으면 같은 알람을 휴대폰 푸시로 보내고, 정해진 시간 안에 확인하지 않으면 문자·알림톡으로 다시 보냅니다.
import type { Hearing, HearingAlert, HearingChange, Room, User } from './types';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-11-05 → 11월 5일(목) */
export function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return date;
  const k = new Date(d.getTime() + 9 * 3_600_000);
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일(${WEEK[k.getUTCDay()]})`;
}

export function whenLabel(date: string, time?: string): string {
  return `${dateLabel(date)}${time ? ` ${time}` : ''}`;
}

/** 오늘(한국 시간) 기준 D-day. 지난 기일은 음수. */
export function dDay(date: string, now = new Date()): number {
  const today = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function dDayLabel(n: number): string {
  return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`;
}

export const CHANGE_LABEL: Record<HearingChange, string> = { new: '새 기일', changed: '기일 변경', cancelled: '기일 취소' };

export function alertText(a: Pick<HearingAlert, 'change' | 'label' | 'date' | 'time' | 'place' | 'prevDate' | 'prevTime' | 'source'>): string {
  const lines = [CHANGE_LABEL[a.change]];
  if (a.change === 'changed' && a.prevDate) lines.push(`· ${a.label}: ${whenLabel(a.prevDate, a.prevTime)} → ${whenLabel(a.date, a.time)}`);
  else lines.push(`· ${a.label}: ${whenLabel(a.date, a.time)}${a.change === 'cancelled' ? ' (취소)' : ''}`);
  if (a.place && a.change !== 'cancelled') lines.push(`· 장소: ${a.place}`);
  lines.push(`· 출처: ${a.source === 'daeryuntop' ? '대륜탑 자동 연동' : '담당 변호사 입력'}`);
  return lines.join('\n');
}

/** 미리 알림 세 번: 기일 7일 전·전날 오전 9시, 당일 오전 8시 (지난 것은 빼고) */
export function reminderPlan(h: Pick<Hearing, 'date'>, now = new Date()): { label: string; at: string }[] {
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+09:00`);
  const base = at(h.date, '00:00');
  const day = (n: number) => new Date(base.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  const plan = [
    { label: '7일 전', at: at(day(7), '09:00') },
    { label: '전날', at: at(day(1), '09:00') },
    { label: '당일 아침', at: at(h.date, '08:00') },
  ];
  return plan.filter((p) => p.at.getTime() > now.getTime()).map((p) => ({ label: p.label, at: p.at.toISOString() }));
}

/** 알람 받을 사람: 방의 의뢰인과 로펌 구성원 모두 */
export function recipientsOf(room: Room, users: User[]): string[] {
  return room.memberIds.filter((id) => users.some((u) => u.id === id));
}

/** 내가 아직 확인하지 않은 기일 알람 (오래된 것부터) */
export function pendingFor(userId: string, alerts: HearingAlert[]): HearingAlert[] {
  return alerts.filter((a) => a.recipients.includes(userId) && !a.ackedBy[userId]).sort((a, b) => a.at.localeCompare(b.at));
}

/** 확인 현황: 의뢰인 먼저 */
export function ackStatus(a: HearingAlert, users: User[]): { user: User; at?: string }[] {
  return a.recipients
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u)
    .sort((x, y) => Number(y.role === 'client') - Number(x.role === 'client'))
    .map((user) => ({ user, at: a.ackedBy[user.id] }));
}

/** 의뢰인이 확인하지 않은 채 지난 시간(시간 단위). 확인했거나 의뢰인이 없으면 undefined. */
export function clientUnackedHours(a: HearingAlert, users: User[], now = Date.now()): number | undefined {
  const clients = a.recipients.filter((id) => users.find((u) => u.id === id)?.role === 'client');
  if (!clients.length || clients.every((id) => a.ackedBy[id])) return undefined;
  return Math.floor((now - Date.parse(a.at)) / 3_600_000);
}

/** 대륜탑 연동 시연: 다음 법정 기일('…기일')을 2주 뒤로 미루거나, 없으면 새 변론기일을 잡습니다. 제출 기한은 건드리지 않습니다. */
export function demoUpdate(hearings: Hearing[], now = new Date()): { hearingId?: string; change: HearingChange; label: string; date: string; time: string; place: string } {
  const today = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const next = [...hearings].filter((h) => h.date >= today && h.label.includes('기일')).sort((a, b) => a.date.localeCompare(b.date))[0];
  const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  if (next) return { hearingId: next.id, change: 'changed', label: next.label, date: shift(next.date, 14), time: '14:30', place: next.place ?? '예시지방법원 제301호 법정' };
  return { change: 'new', label: '변론기일', date: shift(today, 21), time: '10:00', place: '예시지방법원 제301호 법정' };
}
