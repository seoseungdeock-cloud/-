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
  e2ee: {
    label: '종단간 암호화방',
    short: '암호화',
    description: '대화 내용은 참여자 기기에서만 열립니다. 운영자와 AI 모두 읽을 수 없어 AI 기능은 쓸 수 없습니다.',
  },
  ai: {
    label: 'AI 참여방',
    short: 'AI 참여 중',
    description: 'AI가 대화와 자료를 읽고 요약·의견을 냅니다. 이 방의 모든 참여자에게 AI 참여 사실이 항상 표시됩니다.',
  },
};

/** 방 종류마다 처음에 권하는 보안 방식 */
export function defaultMode(kind: RoomKind): RoomMode {
  return kind === 'case' || kind === 'meeting' || kind === 'marketing' ? 'ai' : 'e2ee';
}

/** 회의방·마케팅방은 AI가 일하는 방이라 AI 참여방만 만들 수 있습니다. */
export function allowedModes(kind: RoomKind): RoomMode[] {
  return kind === 'meeting' || kind === 'marketing' ? ['ai'] : ['e2ee', 'ai'];
}

export type RoomCheck = { ok: true } | { ok: false; reason: string };

/** 방을 만들 수 있는지 규칙 확인 (규제전문가 검토 반영) */
export function canCreateRoom(kind: RoomKind, mode: RoomMode, creator: User, members: User[]): RoomCheck {
  if (!allowedModes(kind).includes(mode)) {
    return { ok: false, reason: `${ROOM_KIND_LABEL[kind]}은 AI 참여방으로만 만들 수 있습니다.` };
  }
  if (kind === 'stranger') {
    // 본인인증 없는 익명 대화는 랜덤채팅 앱(청소년유해매체물)으로 분류될 수 있음
    const notAdult = [creator, ...members].filter((u) => !u.adultVerified);
    if (notAdult.length > 0) {
      return { ok: false, reason: '모르는 사람과의 대화는 참여자 모두 성인인증이 필요합니다.' };
    }
  }
  if (kind === 'case') {
    const unverified = [creator, ...members].filter((u) => !u.identityVerified);
    if (unverified.length > 0) {
      return { ok: false, reason: '사건방은 참여자 모두 본인확인이 필요합니다 (이해충돌 확인·위임계약).' };
    }
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
export function aiAnswerLevel(room: Room, members: User[]): 'none' | 'general-info' | 'lawyer-assist' | 'work' {
  if (!aiCanJoin(room)) return 'none';
  if (room.kind === 'meeting' || room.kind === 'marketing' || room.kind === 'office') return 'work';
  const hasLawyer = members.some((u) => u.role === 'lawyer');
  return hasLawyer ? 'lawyer-assist' : 'general-info';
}

export function canUseAgents(user: User): boolean {
  return user.role === 'admin' || ((user.role === 'staff' || user.role === 'lawyer') && user.agentAccess);
}

export function isWorkUser(user: User): boolean {
  return user.role !== 'client';
}
