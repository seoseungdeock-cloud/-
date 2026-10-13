// 앱 전체에서 쓰는 기본 타입. 서버가 붙기 전까지는 기기 메모리에서만 동작합니다.

export type Role = 'client' | 'lawyer' | 'staff' | 'admin';

export type User = {
  id: string;
  nickname: string; // 평소에는 닉네임(익명)으로만 보입니다
  role: Role;
  officeId?: string; // 변호사·직원이 소속된 사무소
  /** 사건방 입장 등에 필요한 본인확인. 실명은 플랫폼이 아니라 해당 로펌 쪽에만 남깁니다. */
  identityVerified: boolean;
  /** 모르는 사람과의 대화(랜덤채팅 규제)에 필요한 성인인증 */
  adultVerified: boolean;
  /** 경영 에이전트 접근 권한. 어드민이 허용합니다. */
  agentAccess: boolean;
  membership: 'basic' | 'rightnow';
};

/** 방의 종류. 메신저·사건·업무·에이전트가 모두 같은 "방" 구조를 씁니다. */
export type RoomKind =
  | 'direct' // 아는 사람 1:1
  | 'group' // 단체방
  | 'stranger' // 모르는 사람과의 대화
  | 'office' // 사무소방
  | 'consult' // 라잇나우 상담방
  | 'case' // 사건방
  | 'meeting' // 경영 회의방
  | 'marketing'; // 마케팅 작업방

/**
 * 방의 보안 방식. 생성할 때 정하고 이후 바꿀 수 없습니다.
 * - e2ee: 종단간 암호화. 운영자도 AI도 내용을 읽지 못합니다.
 * - ai: AI가 참여해 내용을 읽고 답합니다. 방 상단에 항상 표시됩니다.
 */
export type RoomMode = 'e2ee' | 'ai';

export type CaseStage = '상담' | '수임' | '진행' | '종결';

export type CaseInfo = {
  title: string;
  field: string;
  stage: CaseStage;
  deadlines: { id: string; label: string; date: string }[];
  documents: { id: string; name: string; addedAt: string }[];
  costs: { id: string; label: string; amount: number }[];
  progress: { id: string; at: string; note: string }[];
};

export type Room = {
  id: string;
  kind: RoomKind;
  mode: RoomMode;
  title: string;
  memberIds: string[];
  createdBy: string;
  createdAt: string;
  caseInfo?: CaseInfo;
  officeId?: string; // 상담·사건방의 담당 사무소
};

export type MessageKind = 'text' | 'ai' | 'system';

export type Message = {
  id: string;
  roomId: string;
  senderId: string; // AI는 'ai', 시스템은 'system'
  kind: MessageKind;
  text: string;
  at: string;
};

export const AI_SENDER = 'ai';
export const SYSTEM_SENDER = 'system';
