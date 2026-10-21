// 에이전트 레지스트리: 에이전트는 개인이 아니라 회사 공용으로 등록되고,
// 사용 목적·상세 사용 방법 등 매뉴얼이 채워져야만 등록된다. 모든 변경은 버전으로 남는다.
import { ENGINE_AGENTS } from './agents';
import type { Row } from './db';
import { audit, withNames } from './store';
import type { AgentDef, AxUser, Ctx, ModeDef } from './types';
import { AxError, newId, now } from './util';

export const MANUAL_FIELDS = [
  { key: 'purpose', label: '사용 목적', min: 10 },
  { key: 'how_to_use', label: '상세 사용 방법', min: 30 },
  { key: 'inputs', label: '넣어야 할 자료', min: 5 },
  { key: 'outputs', label: '받게 되는 결과물', min: 5 },
  { key: 'cautions', label: '주의사항', min: 5 },
  { key: 'example', label: '사용 예시', min: 10 },
] as const;

const DEFAULT_CHAT: ModeDef = {
  instruction: '사용자와 대화하며 이 에이전트의 업무를 돕습니다. 답은 한국어 마크다운으로, 필요한 만큼만 간결하게 씁니다. 모르는 사실은 지어내지 말고 확인이 필요하다고 말합니다.',
  json: false,
};

// 팀 에이전트가 작업지시를 받으면 쓰는 기본 실행 방식 (에이전트가 따로 정의하지 않았을 때)
const DEFAULT_EXECUTE: ModeDef = {
  label: '작업지시 실행',
  instruction:
    '입력의 work_order(작업지시)를 수행해 바로 검토할 수 있는 결과물을 만듭니다. feedback 이 있으면 previous_output 을 그 요구대로 고칩니다. 외부로 나가는 행위(발행·발송·배포·채용공고 게시 등)는 직접 하지 말고 external_actions 에 승인 요청으로만 적습니다.',
  output_schema:
    '{"title":"결과물 제목","deliverable_markdown":"결과물 본문(마크다운)","cost_estimate":{"total":숫자|null,"unit":"원","breakdown":[{"item":"항목","amount":숫자}]}|null,"next_steps":["다음 단계"],"decisions_needed":[{"question":"사람이 정할 것","options":["선택지"],"recommendation":"추천"}],"external_actions":[{"action":"외부 실행 내용","reason":"이유"}]}',
  json: true,
};

export function validateManual(manual: Record<string, unknown> | undefined): string[] {
  const errs: string[] = [];
  for (const f of MANUAL_FIELDS) {
    const v = String(manual?.[f.key] || '').trim();
    if ([...v].length < f.min) errs.push(`매뉴얼 '${f.label}'을(를) ${f.min}자 이상 적어 주세요.`);
  }
  return errs;
}

function validateDef(def: Partial<AgentDef>, creating: boolean): string[] {
  const errs: string[] = [];
  if (creating && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(def.slug || '')) errs.push('식별자(slug)는 영문 소문자·숫자·하이픈 2~40자입니다.');
  if (!String(def.name || '').trim()) errs.push('이름은 필수입니다.');
  if ([...String(def.prompt || '')].length < 30) errs.push('역할 지시문(프롬프트)을 30자 이상 적어 주세요.');
  if (def.model && !/^(tier:(economy|balanced|best)|(anthropic|openai|gemini):[\w.-]+)$/.test(def.model)) errs.push('모델 지정 형식이 올바르지 않습니다.');
  if (def.modes && typeof def.modes !== 'object') errs.push('modes 형식이 올바르지 않습니다.');
  errs.push(...validateManual(def.manual as Record<string, unknown>));
  return errs;
}

export type AgentFull = Row & { v: Row & { prompt: string; modes: Record<string, ModeDef>; model: string; provider_preference: string | null; manual: Record<string, string> } };

let synced: WeakSet<object> = new WeakSet();

/** 기본 에이전트 정의를 저장소와 맞춘다 (처음 쓸 때 한 번).
 *  없으면 등록, 엔진 정의가 새로 나왔고 마지막 버전을 사람이 고치지 않았다면 새 버전으로 갱신. */
export async function syncDefaults(ctx: Ctx) {
  if (synced.has(ctx.db)) return;
  synced.add(ctx.db);
  const have = new Map((await ctx.db.find('agents', {}, { cols: ['id', 'slug', 'current_version', 'engine_def_version'] })).map((a) => [a.slug, a]));
  for (const def of ENGINE_AGENTS) {
    if (validateDef(def, true).length) continue;
    const by = 'engine';
    const a = have.get(def.slug);
    if (!a) {
      const id = newId('a_');
      try {
        await ctx.db.insert('agents', {
          id, slug: def.slug, name: def.name, team: def.team || null, role: def.role || 'custom', origin: 'engine', current_version: 1,
          engine_def_version: def.def_version || 1, author_id: null, archived: false, run_count: 0, last_run_at: null, created_at: now(), updated_at: now(),
        });
      } catch {
        continue; // 동시에 들어온 다른 요청이 먼저 등록함
      }
      await insertVersion(ctx, id, 1, def, by, '기본 정의 등록');
      continue;
    }
    if ((def.def_version || 1) <= (a.engine_def_version || 0)) continue;
    const last = await ctx.db.one('agent_versions', { eq: { agent_id: a.id, version: a.current_version } });
    if (last && last.created_by !== by) continue;
    const nv = a.current_version + 1;
    await insertVersion(ctx, a.id, nv, def, by, `기본 정의 v${def.def_version} 반영`);
    await ctx.db.update('agents', { eq: { id: a.id } }, { current_version: nv, engine_def_version: def.def_version, name: def.name, team: def.team || null, role: def.role || 'custom', updated_at: now() });
  }
}

/** 시험용: 다음에 다시 맞추기 */
export function resetSync() {
  synced = new WeakSet();
}

async function insertVersion(ctx: Ctx, agentId: string, version: number, def: Partial<AgentDef>, createdBy: string, note: string | null) {
  await ctx.db.insert('agent_versions', {
    agent_id: agentId, version, prompt: def.prompt, modes: def.modes || {}, model: def.model || 'tier:balanced', provider_preference: def.provider_preference || null,
    manual: def.manual || {}, change_note: note || null, created_by: createdBy, created_at: now(),
  });
}

export async function getAgent(ctx: Ctx, slugOrId: string, version: number | null = null): Promise<AgentFull> {
  await syncDefaults(ctx);
  const a = (await ctx.db.one('agents', { eq: { slug: slugOrId } })) ?? (await ctx.db.one('agents', { eq: { id: slugOrId } }));
  if (!a) throw new AxError(404, `에이전트를 찾을 수 없습니다: ${slugOrId}`);
  const v = await ctx.db.one('agent_versions', { eq: { agent_id: a.id, version: version || a.current_version } });
  if (!v) throw new AxError(404, '해당 버전이 없습니다.');
  const [named] = await withNames(ctx, [a], 'author_id', 'author_name');
  return { ...named, author_name: named.author_name || (a.origin === 'engine' ? 'AXIOM 엔진' : null), v: { ...v, modes: v.modes || {}, manual: v.manual || {} } } as unknown as AgentFull;
}

export async function listAgents(ctx: Ctx, { includeArchived = false } = {}): Promise<Row[]> {
  await syncDefaults(ctx);
  const rows = await ctx.db.find('agents', includeArchived ? {} : { eq: { archived: false } }, { order: [['team', 'asc'], ['name', 'asc']] });
  const out: Row[] = [];
  for (const a of await withNames(ctx, rows, 'author_id', 'author_name')) {
    const v = await ctx.db.one('agent_versions', { eq: { agent_id: a.id, version: a.current_version } });
    out.push({ ...a, manual: v?.manual || {}, model: v?.model, provider_preference: v?.provider_preference, author_name: a.author_name || (a.origin === 'engine' ? 'AXIOM 엔진' : null) });
  }
  return out;
}

// 화면에서 새 에이전트를 만들 때 — 조직 소유(origin=instance)
export async function createAgent(ctx: Ctx, user: AxUser, def: Partial<AgentDef>) {
  await syncDefaults(ctx);
  const errs = validateDef(def, true);
  if (errs.length) throw new AxError(400, errs.join('\n'));
  if (def.team && !(ctx.inst.teams || []).some((t) => t.key === def.team)) throw new AxError(400, '없는 팀입니다.');
  if (await ctx.db.one('agents', { eq: { slug: def.slug } })) throw new AxError(409, '이미 쓰는 식별자입니다.');
  const id = newId('a_');
  const t = now();
  await ctx.db.insert('agents', {
    id, slug: def.slug, name: String(def.name).trim(), team: def.team || null, role: def.role || 'custom', origin: 'instance', current_version: 1,
    engine_def_version: null, author_id: user.id, archived: false, run_count: 0, last_run_at: null, created_at: t, updated_at: t,
  });
  await insertVersion(ctx, id, 1, def, user.id, '최초 등록');
  await audit(ctx, user, 'agent.create', def.slug!, def.name);
  return getAgent(ctx, def.slug!);
}

// 수정은 항상 새 버전. 이전 버전과 그 버전으로 실행된 기록은 그대로 남는다.
export async function updateAgent(ctx: Ctx, user: AxUser, slug: string, patch: Partial<AgentDef> & { change_note?: string }) {
  const a = await getAgent(ctx, slug);
  if (a.origin === 'engine' && user.role !== 'admin') throw new AxError(403, '엔진 기본 에이전트는 관리자만 고칠 수 있습니다.');
  if (!String(patch.change_note || '').trim()) throw new AxError(400, '무엇을 왜 바꿨는지(변경 메모)를 적어 주세요.');
  const def: Partial<AgentDef> = {
    name: patch.name ?? a.name,
    prompt: patch.prompt ?? a.v.prompt,
    modes: patch.modes ?? a.v.modes,
    model: patch.model ?? a.v.model,
    provider_preference: patch.provider_preference !== undefined ? patch.provider_preference : a.v.provider_preference,
    manual: { ...a.v.manual, ...(patch.manual || {}) },
  };
  const errs = validateDef(def, false);
  if (errs.length) throw new AxError(400, errs.join('\n'));
  const nv = a.current_version + 1;
  await insertVersion(ctx, a.id, nv, def, user.id, patch.change_note!);
  await ctx.db.update('agents', { eq: { id: a.id } }, { current_version: nv, name: def.name, updated_at: now() });
  await audit(ctx, user, 'agent.update', slug, `v${nv}: ${patch.change_note}`);
  return getAgent(ctx, slug);
}

export async function setArchived(ctx: Ctx, user: AxUser, slug: string, archived: boolean) {
  const a = await getAgent(ctx, slug);
  if (user.role !== 'admin') throw new AxError(403, '보관 처리는 관리자만 할 수 있습니다.');
  await ctx.db.update('agents', { eq: { id: a.id } }, { archived, updated_at: now() });
  await audit(ctx, user, archived ? 'agent.archive' : 'agent.unarchive', slug);
}

export async function versions(ctx: Ctx, slug: string) {
  const a = await getAgent(ctx, slug);
  const rows = await ctx.db.find('agent_versions', { eq: { agent_id: a.id } }, { order: [['version', 'desc']], cols: ['version', 'change_note', 'model', 'created_at', 'created_by'] });
  const named = await withNames(ctx, rows, 'created_by', 'by_name');
  return named.map((r) => ({ ...r, by_name: r.by_name || (r.created_by === 'engine' ? 'AXIOM 엔진' : r.created_by) }));
}

// 창업·이전 시 가져갈 수 있는 것: 엔진 소유 에이전트만. 조직이 만든 에이전트는 포함하지 않는다.
export async function exportEngineAgents(ctx: Ctx) {
  const out = [];
  for (const a of (await listAgents(ctx, { includeArchived: true })).filter((x) => x.origin === 'engine')) {
    const full = await getAgent(ctx, a.slug);
    out.push({ slug: a.slug, name: a.name, team: a.team, role: a.role, prompt: full.v.prompt, modes: full.v.modes, model: full.v.model, provider_preference: full.v.provider_preference, manual: full.v.manual });
  }
  return out;
}

export function modeOf(agent: AgentFull, mode: string | undefined): ModeDef {
  const modes = agent.v.modes || {};
  if (mode && modes[mode]) return modes[mode];
  if (mode === 'chat' || !mode) return modes.chat || DEFAULT_CHAT;
  if (mode === 'execute') return DEFAULT_EXECUTE;
  throw new AxError(400, `에이전트 '${agent.name}'에 '${mode}' 작업 방식이 없습니다.`);
}
