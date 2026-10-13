// 오픈대화방: 방마다 정한 닉네임으로만 참여합니다. 실명·프로필 사진·직책은 누구에게도 보이지 않습니다.
import type { OpenMessage, OpenRoom, User } from './types';

export const OPEN_MAX_OPTIONS = [10, 30, 100, 300];

export function aliasOf(room: OpenRoom, userId: string): string | undefined {
  return room.members.find((m) => m.userId === userId)?.alias;
}

export function isOpenMember(room: OpenRoom, userId: string): boolean {
  return room.members.some((m) => m.userId === userId);
}

/** 오픈대화방은 법무법인 구성원(변호사·직원·어드민)만 씁니다. 의뢰인 계정은 사건방만 봅니다. */
export function canUseOpenChat(u: User): boolean {
  return u.role !== 'client';
}

/** 닉네임 규칙: 1~12자, 방 안에서 겹치지 않기, 실명과 같으면 안 됨 */
export function checkAlias(room: OpenRoom | undefined, alias: string, me: User): string | undefined {
  const a = alias.trim();
  if (!a) return '닉네임을 입력해 주세요.';
  if (a.length > 12) return '닉네임은 12자 이내로 적어 주세요.';
  if (a === me.nickname) return '실명과 다른 닉네임을 써 주세요.';
  if (room?.members.some((m) => m.alias === a && m.userId !== me.id)) return '이 방에서 이미 쓰는 닉네임입니다.';
  return undefined;
}

export function lastOpenMessage(roomId: string, messages: OpenMessage[]): OpenMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].roomId === roomId) return messages[i];
  return undefined;
}

/** 내가 참여한 방 (최근 대화순) / 참여하지 않은 방 (인원 많은 순) */
export function splitOpenRooms(rooms: OpenRoom[], messages: OpenMessage[], userId: string) {
  const key = (r: OpenRoom) => lastOpenMessage(r.id, messages)?.at ?? r.createdAt;
  return {
    mine: rooms.filter((r) => isOpenMember(r, userId)).sort((a, b) => key(b).localeCompare(key(a))),
    others: rooms.filter((r) => !isOpenMember(r, userId) && !r.banned.includes(userId)).sort((a, b) => b.members.length - a.members.length),
  };
}

/** 방 이름·소개·태그로 찾기 ('#이혼'처럼 써도 됩니다) */
export function searchOpenRooms(rooms: OpenRoom[], q: string): OpenRoom[] {
  const query = q.trim().replace(/^#/, '');
  if (!query) return rooms;
  return rooms.filter((r) => r.title.includes(query) || r.description.includes(query) || r.tags.some((t) => t.includes(query)));
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,\s#]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 5);
}
