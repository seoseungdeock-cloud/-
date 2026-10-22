import type { Db } from './db';

export type Team = { key: string; label: string; agent?: string };
export type Tier = 'auto' | 'post' | 'pre';

export type GuardRule = { id: string; pattern: string; flags?: string; label: string; basis: string; severity?: string; mask?: boolean };

export type Instance = {
  key: string;
  name: string;
  brand: { org_label: string; product: string; color: string; logo: string | null };
  timezone: string;
  default_visibility: string;
  teams: Team[];
  sensitive_teams?: string[];
  approval_policy: Record<string, string>;
  models: {
    tiers: Record<string, Partial<Record<'economy' | 'balanced' | 'best', string>>>;
    fallback_order: string[];
    prices: Record<string, { in: number; out: number }>;
    concurrency?: number;
  };
  budget: { monthly_usd: number | null };
  council: { max_agenda?: number; strategies?: number; max_work_orders?: number; default_visibility?: string; state_template?: string; agents?: Record<string, string> };
  principles: string;
  guardrails: GuardRule[];
};

export type ModeDef = { label?: string; instruction?: string; output_schema?: string; json?: boolean; model?: string; max_tokens?: number };

export type Manual = Partial<Record<'purpose' | 'how_to_use' | 'inputs' | 'outputs' | 'cautions' | 'example', string>>;

export type AgentDef = {
  def_version?: number;
  slug: string;
  name: string;
  team?: string | null;
  role?: string;
  model?: string;
  provider_preference?: string | null;
  prompt: string;
  modes?: Record<string, ModeDef>;
  manual: Manual;
  origin?: 'engine' | 'instance';
};

/** AXIOM 에서의 사람. 라잇나우 계정에서 옵니다: 관리자어드민 → admin, 다른 어드민 → lead(모든 팀) */
export type AxUser = { id: string; name: string; role: 'admin' | 'lead' | 'member'; teams: string[] };

export type Env = { ANTHROPIC_API_KEY?: string; OPENAI_API_KEY?: string; GEMINI_API_KEY?: string; AXIOM_LLM?: string; AXIOM_LLM_TIMEOUT_MS?: string };

/** 나중에 따로 돌릴 일 (서버에서는 함수를 한 번 더 불러 새 실행 시간으로, 앱에서는 바로 이어서) */
export type Job =
  | { type: 'council'; councilId: string; step: string; token: string }
  | { type: 'plan'; councilId: string; userId: string; comment: string }
  | { type: 'report'; scheduleId: string; force: boolean }
  | { type: 'work'; workOrderId: string; userId: string; feedback: string | null };

export type RoomInfo = { kind: string; title: string; members: { id: string; role: string }[] };

export type Ctx = {
  db: Db;
  inst: Instance;
  env: Env;
  /** 사람 이름 찾기 */
  names(ids: string[]): Promise<Record<string, string>>;
  /** 사람 계정 찾기 (백그라운드 일에서 시작한 사람 권한으로 실행) */
  userById(id: string): Promise<AxUser | null>;
  /** 첫 관리자어드민 (정기 보고 작성자) */
  owner(): Promise<AxUser | null>;
  spawn(job: Job): void;
  /** 대화방 정보 (경영위원회를 방에 연결할 때). 없는 방이면 null */
  room?(roomId: string): Promise<RoomInfo | null>;
  /** 대화방에 AI 메시지 올리기 (by = 올린 것으로 기록할 사람) */
  postToRoom?(roomId: string, text: string, by: string): Promise<void>;
  /** 시험에서 AI 호출을 가로챌 때 */
  fetch?: typeof fetch;
};
