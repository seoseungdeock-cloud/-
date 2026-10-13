// 앱 전체에서 쓰는 기본 타입. 서버가 붙기 전까지는 기기 메모리에서만 동작합니다.

export type Role = 'client' | 'lawyer' | 'staff' | 'admin';

export type User = {
  id: string;
  nickname: string; // 평소에는 닉네임(익명)으로만 보입니다
  role: Role;
  officeId?: string; // 변호사·직원이 소속된 사무소
  firm?: string; // 소속 법무법인 (주소록 범위)
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
 * 방의 방식. 생성할 때 정하고 이후 바꿀 수 없습니다.
 * - private: 사건수행방. 참여자끼리만 대화하고 AI는 참여하지 않습니다.
 * - ai: AI가 참여해 내용을 읽고 답합니다. 방 상단에 항상 표시됩니다.
 */
export type RoomMode = 'private' | 'ai';

/** 로그인 계정. 백오피스에서 만들고 관리합니다. */
export type Account = {
  userId: string;
  loginId: string;
  /** 서버 연결 전 임시 저장. 서버가 붙으면 서버에서 암호화해 보관합니다. */
  password: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
};

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
  lawyerId?: string; // 찾기에서 고른 담당 변호사 (배당 정보 안내용)
};

export type MessageKind = 'text' | 'ai' | 'system' | 'bot';

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
/** 사건 진행·배당 알림과 절차 안내 봇. 대화 내용을 AI에 보내지 않고 사건 기록과 정해진 안내문만 씁니다. */
export const BOT_SENDER = 'bot';

// ---- 익명 게시판 ----
// 이용자 구분 없이 글마다 '익명 1, 2…'로만 보이고, 실제 작성자는 어드민만 봅니다.

/** 사용자 id → +1(추천) / -1(비추천) */
export type Votes = Record<string, 1 | -1>;

export type BoardComment = { id: string; authorId: string; parentId?: string; text: string; at: string; votes: Votes; deleted?: boolean };

export type BoardPost = {
  id: string;
  authorId: string;
  field: string;
  title: string;
  body: string;
  at: string;
  votes: Votes;
  comments: BoardComment[];
};

/** 익명 쪽지: 게시판 글에서 시작한 두 사람의 대화. 서로 그 글의 '익명 N'으로만 보입니다. */
export type NoteThread = {
  id: string;
  postId: string;
  memberIds: [string, string];
  messages: { id: string; senderId: string; text: string; at: string }[];
  /** 사용자 id → 마지막으로 읽은 시각 */
  readAt: Record<string, string>;
};

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

/** 게시판 신고. commentId가 없으면 글 신고 */
export type BoardReport = {
  id: string;
  postId: string;
  commentId?: string;
  reporterId: string;
  reason: string;
  at: string;
  status: ReportStatus;
  /** 어드민 처리 내용 (삭제, 이용 제한 등) */
  resolution?: string;
};
