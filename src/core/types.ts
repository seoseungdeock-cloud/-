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
  // ---- 주소록 프로필 (조직도·연락처 상세) ----
  title?: string; // 직책 (예: Junior Associate Attorney)
  dept?: string; // 부서 (조직도 단위)
  branch?: string; // 지점 (이름 옆 괄호에 표시)
  phone?: string;
  email?: string;
  birthday?: string; // YYYY-MM-DD
  joinedAt?: string; // YYYY-MM-DD
  photo?: string; // 프로필 사진 (지금은 기기 안 주소, 서버가 붙으면 업로드 주소)
  status?: string; // 상태 메시지
  presence?: Presence; // 상태 (대화 가능, 회의 중 등)
  /** 관리자어드민: 어드민 중에서도 오픈대화방 실제 이용자 확인·관리 권한 */
  superAdmin?: boolean;
  /** 대표 계정: 모든 사건의 불변기간 경고 알림을 받습니다. 어드민이 정합니다. */
  executive?: boolean;
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

/** 기일. time·place는 대륜탑 연동이나 변호사가 입력하면 붙습니다. */
export type Hearing = {
  id: string; label: string; date: string; time?: string; place?: string; source?: HearingSource;
  /** 대륜탑 기일 번호 */
  externalId?: string;
  /** 대륜탑 '확인용'·'상대측' 기일: 의뢰인에게는 보이지 않음 */
  firmOnly?: boolean;
  /** 대륜탑 '엄수': 3일 전 미리 알림을 더 보냄 */
  strict?: boolean;
};
export type HearingSource = 'daeryuntop' | 'manual';
export type HearingChange = 'new' | 'changed' | 'cancelled';

/** 기일 알람: 방의 의뢰인·변호사 모두가 '확인했습니다'를 누를 때까지 앱 어디서나 뜹니다. */
export type HearingAlert = {
  id: string;
  roomId: string;
  hearingId: string;
  change: HearingChange;
  label: string;
  date: string;
  time?: string;
  place?: string;
  prevDate?: string;
  prevTime?: string;
  source: HearingSource;
  at: string;
  messageId: string;
  recipients: string[];
  /** 사용자 id → 확인한 시각 */
  ackedBy: Record<string, string>;
};

export type CaseStage = '상담' | '수임' | '진행' | '종결';

export type CaseInfo = {
  title: string;
  field: string;
  stage: CaseStage;
  deadlines: Hearing[];
  documents: { id: string; name: string; addedAt: string }[];
  costs: { id: string; label: string; amount: number }[];
  progress: { id: string; at: string; note: string }[];
  /** 불변기간 (의뢰인에게는 보이지 않음) */
  limits?: FixedDeadline[];
  /** 어드민이 이 사건의 불변기간 알림을 끈 경우 false */
  limitAlerts?: boolean;
  /** 대륜탑 사건번호 (어드민이 연결, 대륜탑 기일을 이 번호로 받음) */
  caseNo?: string;
};

/** 불변기간 (항소·상고·이의신청 기간 등). 만료일 24:00까지. lawyerId가 없으면 사건방의 변호사 전원이 담당. */
export type FixedDeadline = { id: string; label: string; due: string; lawyerId?: string; handledAt?: string; source?: HearingSource; externalId?: string };

/** 어드민 화면의 사건별 불변기간 목록 */
export type DeadlineCase = { roomId: string; title: string; alertsOn: boolean; office: string; limits: FixedDeadline[]; caseNo?: string };

export type Room = {
  id: string;
  kind: RoomKind;
  mode: RoomMode;
  title: string;
  memberIds: string[];
  createdBy: string;
  /** 방 마스터: 강퇴·마스터 지정 권한. 없으면 만든 사람. */
  masters?: string[];
  createdAt: string;
  /** 방 사진 (마스터가 바꿈). 서버에서는 임시 주소 */
  photo?: string;
  caseInfo?: CaseInfo;
  officeId?: string; // 상담·사건방의 담당 사무소
  lawyerId?: string; // 찾기에서 고른 담당 변호사 (배당 정보 안내용)
  // ---- 메신저 설정 (사용자별) ----
  pinnedBy?: string[];
  /** 알림: 전체 / 멘션만 / 끄기. 없으면 전체 */
  notify?: Record<string, NotifyLevel>;
  /** 사용자 id → 숨긴 시각. 그 뒤로 새 메시지가 오면 다시 보입니다. */
  hiddenAt?: Record<string, string>;
  notices?: RoomNotice[];
  /** 공지 '다시 보지 않기' 한 사람 (새 공지가 올라오면 초기화) */
  noticeHiddenBy?: string[];
};

export type NotifyLevel = 'all' | 'mention' | 'off';

export type RoomNotice = { id: string; messageId: string; text: string; by: string; at: string };

export type MessageKind = 'text' | 'ai' | 'system' | 'bot' | 'contact';

export type Message = {
  id: string;
  roomId: string;
  senderId: string; // AI는 'ai', 시스템은 'system'
  kind: MessageKind;
  text: string;
  at: string;
  /** 답장한 원래 메시지 */
  replyTo?: string;
  /** 다른 방에서 전달된 메시지의 원래 보낸 사람·내용 */
  forwardOf?: { senderId: string; text: string };
  /** 여러 말풍선을 묶어 전달한 메시지 ('메시지 상세보기'로 펼침) */
  bundle?: ForwardBundle;
  /** 보낸 사람이 회수한 메시지 */
  recalled?: boolean;
  /** 사용자 id → 공감 이모지 */
  reactions?: Record<string, string>;
  /** @멘션된 사용자 id ('all'은 전체) */
  mentions?: string[];
  /** 기일 알람 카드 */
  hearingAlertId?: string;
  /** 연락처 공유 메시지의 대상 */
  contactId?: string;
  /** '나에게서 삭제'한 사용자 */
  deletedFor?: string[];
  /** 방에 올린 사진·파일 */
  attachments?: Attachment[];
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
  /** 게시판 종류 (없으면 익명 게시판). 익명 게시판 말고는 메신저 프로필 공개 */
  board?: BoardKind;
  attachments?: Attachment[];
  /** SKYZAI 게시판의 공지 글 (어드민만) */
  notice?: boolean;
  /** 법령·판례 자동 글의 출처 번호 (중복 게시 방지) */
  sourceId?: string;
  /** 서버가 정한 글 안의 익명 번호 (사용자 id → N). 없으면 등장 순서로 셉니다. */
  aliases?: Record<string, number>;
};

export type BoardKind = 'notice' | 'deadline' | 'anon' | 'lawyer' | 'advice' | 'event' | 'praise' | 'lawnews' | 'skyzai';

export type SuggestionStatus = 'open' | 'review' | 'done' | 'hold';
export type Suggestion = { id: string; authorId: string; body: string; at: string; status: SuggestionStatus; answer?: string; answeredAt?: string };

/** 첨부 (사진·파일). uri는 화면에 띄울 주소(기기 안 주소 또는 서버가 내준 임시 주소), path는 서버 저장소 경로입니다. */
export type Attachment = { id: string; kind: 'image' | 'file'; name: string; uri: string; size?: number; mime?: string; path?: string };

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

export type ForwardBundle = { title: string; items: { senderId: string; text: string; at: string }[] };

/** 상태 설정 (네이버웍스 상태 참고, 재판 중 추가) */
export type Presence = 'available' | 'busy' | 'meeting' | 'court' | 'outside' | 'trip' | 'vacation' | 'dnd';

// ---- 오픈대화방 (카카오톡 오픈채팅처럼 방마다 닉네임으로만 참여, 실명·프로필은 보이지 않음) ----
export type OpenMember = { userId: string; alias: string; joinedAt: string };
export type OpenRoom = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  hostId: string; // 방장
  members: OpenMember[];
  max: number;
  createdAt: string;
  /** 내보낸 사람은 다시 들어올 수 없습니다. */
  banned: string[];
  /** 있으면 참여할 때 비밀번호를 물어봅니다. (서버가 붙으면 서버에서 암호화해 보관) */
  password?: string;
  /** 서버 연결 시: 비밀번호가 걸린 방 (비밀번호 자체는 앱에 오지 않음) */
  locked?: boolean;
};
export type OpenMessage = { id: string; roomId: string; senderId: string; text: string; at: string; system?: boolean };
