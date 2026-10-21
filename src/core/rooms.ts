import { levelOf, type AiLevel } from './room-ai';
import type { Room, RoomKind, RoomMode, User } from './types';

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  direct: '1:1 대화',
  group: '단체방',
  stranger: '새로운 사람',
  office: '사무소방',
  consult: '상담방',
  case: '사건방',
  meeting: '회의방',
  marketing: '마케팅방',
};

export const ROOM_MODE_INFO: Record<RoomMode, { label: string; short: string; description: string }> = {
  private: {
    label: '사건수행방',
    short: '사건수행',
    description: '참여자끼리만 대화하는 방입니다. AI는 참여하지 않습니다.',
  },
  ai: {
    label: 'AI 참여방',
    short: 'AI 참여 중',
    description: 'AI가 대화와 자료를 읽고 요약·의견을 냅니다. 이 방의 모든 참여자에게 AI 참여 사실이 항상 표시됩니다.',
  },
};

/** 방 종류마다 처음에 권하는 방식 */
export function defaultMode(kind: RoomKind): RoomMode {
  return kind === 'case' || kind === 'meeting' || kind === 'marketing' ? 'ai' : 'private';
}

/** 회의방·마케팅방은 AI가 일하는 방이라 AI 참여방만 만들 수 있습니다. */
export function allowedModes(kind: RoomKind): RoomMode[] {
  return kind === 'meeting' || kind === 'marketing' ? ['ai'] : ['private', 'ai'];
}

export type RoomCheck = { ok: true } | { ok: false; reason: string };

/** 방을 만들 수 있는지 규칙 확인 */
export function canCreateRoom(kind: RoomKind, mode: RoomMode, creator: User, members: User[]): RoomCheck {
  if (!allowedModes(kind).includes(mode)) {
    return { ok: false, reason: `${ROOM_KIND_LABEL[kind]}은 AI 참여방으로만 만들 수 있습니다.` };
  }
  if ((kind === 'office' || kind === 'meeting' || kind === 'marketing') && creator.role === 'client') {
    return { ok: false, reason: '업무용 방은 로펌 구성원만 만들 수 있습니다.' };
  }
  if ((kind === 'meeting' || kind === 'marketing') && !canUseAgents(creator)) {
    return { ok: false, reason: '에이전트 방은 어드민이 허용한 사용자만 만들 수 있습니다.' };
  }
  if (kind === 'direct' && members.length !== 1) {
    return { ok: false, reason: '1:1 대화는 상대 한 명을 골라 주세요.' };
  }
  return { ok: true };
}

export function aiCanJoin(room: Room): boolean {
  return room.mode === 'ai';
}

/**
 * AI가 이 방에서 어떤 수준으로 답할 수 있는지.
 * 변호사 없이 AI가 의뢰인에게 법률 의견을 주면 변호사법 109조 위험이 있어
 * 변호사가 함께 있는 방에서만 '변호사 보조' 수준으로 답합니다.
 */
export function aiAnswerLevel(room: Room, members: User[]): AiLevel {
  return levelOf(room.mode, room.kind, members.some((u) => u.role === 'lawyer'));
}

export function canUseAgents(user: User): boolean {
  return user.role === 'admin' || ((user.role === 'staff' || user.role === 'lawyer') && user.agentAccess);
}

/** 업무 탭(경영 에이전트·마케팅 지휘실)은 어드민 계정만 */
export function canSeeWorkTab(user: User): boolean {
  return user.role === 'admin';
}

/** 멤버십 가입은 의뢰인 계정만 */
export function canJoinMembership(user: User): boolean {
  return user.role === 'client';
}

/** 건의사항함: 관리자어드민만 (개발자어드민은 관리자어드민으로 통합) */
export function canSeeSuggestions(user: User): boolean {
  return user.role === 'admin' && !!user.superAdmin;
}

export function isWorkUser(user: User): boolean {
  return user.role !== 'client';
}
