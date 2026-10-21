// 캘린더 탭: 내가 들어가 있는 사건방의 기일과 불변기간을 달력에 모아 봅니다.
import { SELF_ROOM_TITLE, selfRoomLike } from './room-ai';
import type { Room, User } from './types';

export type CalEvent = { id: string; date: string; time?: string; label: string; kind: 'hearing' | 'limit'; roomId: string; caseTitle: string; place?: string; done?: boolean };

/** 의뢰인은 '확인용·상대측' 기일과 불변기간을 보지 않습니다. */
export function calendarEvents(user: User, rooms: Room[]): CalEvent[] {
  const out: CalEvent[] = [];
  for (const r of rooms) {
    if (r.kind !== 'case' || !r.caseInfo || !r.memberIds.includes(user.id)) continue;
    const ci = r.caseInfo;
    for (const h of ci.deadlines) {
      if (user.role === 'client' && h.firmOnly) continue;
      out.push({ id: h.id, date: h.date, time: h.time, label: h.label, kind: 'hearing', roomId: r.id, caseTitle: ci.title, place: h.place });
    }
    if (user.role !== 'client') {
      for (const d of ci.limits ?? []) out.push({ id: d.id, date: d.due, time: '24:00', label: d.label, kind: 'limit', roomId: r.id, caseTitle: ci.title, done: !!d.handledAt });
    }
  }
  return out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

/** 달력 한 장 (일요일 시작, 6주 42칸). 날짜는 'YYYY-MM-DD'. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = Date.UTC(year, month - 1, 1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

/** 오늘 (한국 시간) */
export function todayKst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export { SELF_ROOM_TITLE };

/** 나만 들어 있는 메모용 대화방 */
export function isSelfRoom(room: Room, userId: string): boolean {
  return selfRoomLike(room.kind, room.memberIds.length, room.title) && room.memberIds[0] === userId;
}
