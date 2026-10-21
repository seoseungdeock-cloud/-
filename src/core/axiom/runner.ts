// 에이전트 실행기: 프롬프트 구성 → 모델 선택 → 호출 → JSON 검증(1회 보정) → 규정 점검 → 실행 기록 저장.
// 모든 실행은 runs 표에, 모든 대화는 conversations/messages 와 저장소 문서로 남는다.
import * as acl from './acl';
import { scan, type Flag } from './guardrails';
import * as llm from './llm';
import { getAgent, modeOf, type AgentFull } from './registry';
import * as store from './store';
import type { AxUser, Ctx, ModeDef } from './types';
import { AxError, clip, extractJson, newId, now } from './util';

export function buildSystem(ctx: Ctx, agent: AgentFull, modeDef: ModeDef): string {
  const org = ctx.inst.name;
  const parts = [
    `당신은 ${org}의 회사 공용 AI 에이전트 '${agent.name}'입니다. 당신의 결과물과 대화는 회사 공용 저장소에 기록되어 동료들이 함께 봅니다.`,
    `## 역할\n${agent.v.prompt}`,
    modeDef.instruction ? `## 이번 작업\n${modeDef.instruction}` : '',
    ctx.inst.principles ? `## 조직의 대원칙 (반드시 준수)\n${ctx.inst.principles}` : '',
    `## 공통 원칙\n- 한국어로 작성합니다.\n- 입력에 없는 수치·사실·판례를 지어내지 않습니다. 필요한 자료가 없으면 '자료 부족'이라고 밝히고 무엇이 필요한지 적습니다.\n- 최종 결정은 사람이 합니다. 당신의 출력은 제안이자 참고자료입니다.\n- human_instructions 가 있으면 최우선으로 반영합니다.`,
    modeDef.json ? `## 출력 형식\n아래 JSON 형식의 객체 하나만 출력합니다. 앞뒤 설명이나 코드펜스는 쓰지 않습니다.\n${modeDef.output_schema || '{}'}` : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}

function inputText(input: unknown): string {
  if (typeof input === 'string') return input;
  return `## 입력 자료\n${JSON.stringify(input, null, 2)}`;
}

export async function monthSpend(ctx: Ctx): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await ctx.db.find('runs', { gte: { started_at: start.toISOString() } }, { cols: ['cost_usd'] });
  return rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
}

export type RunOpts = {
  slug: string;
  mode?: string;
  input: unknown;
  user: AxUser | null;
  visibility?: string;
  councilId?: string | null;
  workOrderId?: string | null;
  history?: llm.Msg[];
};
export type RunResult = { run_id: string; output: any; text: string; flags: Flag[]; provider: llm.Provider; model: string; note: string | null; agent: { slug: string; name: string; version: number } };

export async function runAgent(ctx: Ctx, opts: RunOpts): Promise<RunResult> {
  const { db, inst } = ctx;
  const agent = await getAgent(ctx, opts.slug);
  if (agent.archived) throw new AxError(400, `보관 처리된 에이전트입니다: ${agent.name}`);
  const modeKey = opts.mode || 'chat';
  const modeDef = modeOf(agent, modeKey);
  const route = llm.resolve(inst, ctx.env, modeDef.model || agent.v.model, agent.v.provider_preference);

  if (route.provider !== 'mock' && inst.budget?.monthly_usd != null && (await monthSpend(ctx)) >= inst.budget.monthly_usd) {
    throw new AxError(402, `이번 달 AI 예산 한도($${inst.budget.monthly_usd})에 도달했습니다. 관리자에게 문의하세요.`);
  }

  const runId = newId('r_');
  const vis = acl.normalize(opts.visibility || 'org', inst);
  await db.insert('runs', {
    id: runId, agent_id: agent.id, agent_slug: agent.slug, agent_version: agent.current_version, mode: modeKey, council_id: opts.councilId || null,
    work_order_id: opts.workOrderId || null, user_id: opts.user?.id || 'system', visibility: vis, provider: route.provider, model: route.model, note: route.note,
    input: opts.input ?? null, output: null, raw: null, flags: [], status: 'running', error: null, tokens_in: 0, tokens_out: 0, cost_usd: null, started_at: now(), finished_at: null,
  });

  const system = buildSystem(ctx, agent, modeDef);
  const messages: llm.Msg[] = [...(opts.history || []), { role: 'user', content: inputText(opts.input) }];
  const meta = { role: agent.role, mode: modeKey, input: opts.input, agentName: agent.name };
  const maxTokens = modeDef.max_tokens || 8000;
  let usage = { in: 0, out: 0 };
  let text = '';
  let output: any = null;
  let status = 'done';
  let error: string | null = null;

  try {
    const r1 = await llm.complete(ctx, route.provider, { model: route.model, system, messages, json: modeDef.json, meta, maxTokens });
    usage = { in: usage.in + r1.usage.in, out: usage.out + r1.usage.out };
    text = r1.text;
    if (modeDef.json) {
      output = extractJson(text);
      if (!output || typeof output !== 'object') {
        // 한 번만 형식 보정 요청
        const r2 = await llm.complete(ctx, route.provider, {
          model: route.model, system, json: true, meta, maxTokens,
          messages: [...messages, { role: 'assistant', content: text }, { role: 'user', content: '방금 응답을 지정된 JSON 형식의 객체 하나로만 다시 출력하세요. 다른 글은 쓰지 마세요.' }],
        });
        usage = { in: usage.in + r2.usage.in, out: usage.out + r2.usage.out };
        text = r2.text;
        output = extractJson(text);
        if (!output || typeof output !== 'object') {
          status = 'failed';
          error = 'AI 응답이 지정 형식(JSON)이 아닙니다.';
        }
      }
    } else {
      output = text;
    }
  } catch (e) {
    status = 'failed';
    error = (e as Error).message;
  }

  const flags = status === 'done' ? scan(inst, output) : [];
  await db.update('runs', { eq: { id: runId } }, {
    output, raw: modeDef.json ? clip(text, 20000) : null, flags, status, error, tokens_in: usage.in, tokens_out: usage.out,
    cost_usd: llm.cost(inst, route.provider, route.model, usage), finished_at: now(),
  });
  await db.update('agents', { eq: { id: agent.id } }, { run_count: (agent.run_count || 0) + 1, last_run_at: now() });

  if (status === 'failed') {
    const err = new AxError(502, `${agent.name} 실행 실패: ${error}`);
    err.runId = runId;
    throw err;
  }
  return { run_id: runId, output, text, flags, provider: route.provider, model: route.model, note: route.note, agent: { slug: agent.slug, name: agent.name, version: agent.current_version } };
}

async function transcript(ctx: Ctx, convId: string, agentName: string) {
  const ms = await store.withNames(ctx, await ctx.db.find('messages', { eq: { conversation_id: convId } }, { order: [['created_at', 'asc'], ['seq', 'asc']] }), 'user_id', 'name');
  return ms.map((m) => `### ${m.role === 'user' ? m.name || '사용자' : agentName} · ${String(m.created_at).slice(0, 16).replace('T', ' ')}\n\n${m.content}`).join('\n\n');
}

let seq = 0;
const nextSeq = () => Date.now() * 1000 + (seq++ % 1000);

// 사람과 에이전트의 대화. 대화는 시작 시 정한 공개 등급으로 저장소에 쌓인다.
export async function chat(ctx: Ctx, user: AxUser, slug: string, p: { conversation_id?: string; message?: string; visibility?: string }) {
  const { db } = ctx;
  const message = String(p.message || '').trim();
  if (!message) throw new AxError(400, '메시지를 입력하세요.');
  if (message.length > 20000) throw new AxError(400, '메시지가 너무 깁니다(2만 자 이내).');
  const agent = await getAgent(ctx, slug);
  let conv;
  if (p.conversation_id) {
    conv = await db.one('conversations', { eq: { id: p.conversation_id } });
    if (!conv) throw new AxError(404, '대화를 찾을 수 없습니다.');
    acl.assertSee(user, conv.visibility);
  } else {
    const vis = acl.normalize(p.visibility || 'org', ctx.inst);
    if (!acl.canSee(user, vis)) throw new AxError(403, '내가 볼 수 없는 공개 등급으로는 대화를 시작할 수 없습니다.');
    const id = newId('c_');
    const t = now();
    const doc = await store.createDoc(ctx, user, { kind: 'conversation', title: `${agent.name} · ${clip(message, 40)}`, body: '', visibility: vis, agent_id: agent.id, ref_type: 'conversation', ref_id: id });
    conv = { id, agent_id: agent.id, user_id: user.id, title: clip(message, 80), visibility: vis, doc_id: doc.id, created_at: t, updated_at: t };
    await db.insert('conversations', conv);
  }

  const history = (await db.find('messages', { eq: { conversation_id: conv.id } }, { order: [['created_at', 'asc'], ['seq', 'asc']], cols: ['role', 'content'] })).slice(-20) as llm.Msg[];
  await db.insert('messages', { id: newId('m_'), conversation_id: conv.id, role: 'user', content: message, run_id: null, user_id: user.id, created_at: now(), seq: nextSeq() });
  let res: RunResult;
  try {
    res = await runAgent(ctx, { slug, mode: 'chat', input: message, user, visibility: conv.visibility, history });
  } finally {
    await db.update('conversations', { eq: { id: conv.id } }, { updated_at: now() });
  }
  await db.insert('messages', { id: newId('m_'), conversation_id: conv.id, role: 'assistant', content: String(res.output), run_id: res.run_id, user_id: null, created_at: now(), seq: nextSeq() });
  await store.systemUpdateBody(ctx, conv.doc_id, await transcript(ctx, conv.id, agent.name));
  return { conversation: await db.one('conversations', { eq: { id: conv.id } }), reply: res.output, run_id: res.run_id, flags: res.flags, provider: res.provider, model: res.model, note: res.note };
}

export async function getConversation(ctx: Ctx, user: AxUser, id: string) {
  const c = await ctx.db.one('conversations', { eq: { id } });
  if (!c) throw new AxError(404, '대화를 찾을 수 없습니다.');
  acl.assertSee(user, c.visibility);
  const a = await ctx.db.one('agents', { eq: { id: c.agent_id } });
  const messages = await store.withNames(ctx, await ctx.db.find('messages', { eq: { conversation_id: id } }, { order: [['created_at', 'asc'], ['seq', 'asc']] }), 'user_id', 'user_name');
  return { ...c, agent_slug: a?.slug, agent_name: a?.name, visibility_label: acl.label(c.visibility, ctx.inst), messages };
}

export async function listConversations(ctx: Ctx, user: AxUser, q: { agent?: string } = {}) {
  const where = { ...acl.filter(user), eq: {} as Record<string, unknown> };
  let agent = null;
  if (q.agent) {
    agent = await ctx.db.one('agents', { eq: { slug: q.agent } });
    if (!agent) return [];
    where.eq.agent_id = agent.id;
  }
  const rows = await store.withNames(ctx, await ctx.db.find('conversations', where, { order: [['updated_at', 'desc']], limit: 100 }), 'user_id', 'user_name');
  const agents = new Map((await ctx.db.find('agents', {}, { cols: ['id', 'slug', 'name'] })).map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, agent_slug: agents.get(r.agent_id)?.slug, agent_name: agents.get(r.agent_id)?.name, visibility_label: acl.label(r.visibility, ctx.inst) }));
}

export async function listRuns(ctx: Ctx, user: AxUser, q: { council_id?: string; work_order_id?: string; limit?: number } = {}) {
  const where = { ...acl.filter(user), eq: {} as Record<string, unknown> };
  if (q.council_id) where.eq.council_id = q.council_id;
  if (q.work_order_id) where.eq.work_order_id = q.work_order_id;
  const rows = await ctx.db.find('runs', where, {
    order: [['started_at', 'desc']],
    limit: Math.min(Number(q.limit) || 50, 500),
    cols: ['id', 'agent_id', 'agent_slug', 'agent_version', 'mode', 'provider', 'model', 'note', 'status', 'error', 'flags', 'tokens_in', 'tokens_out', 'cost_usd', 'started_at', 'finished_at'],
  });
  const agents = new Map((await ctx.db.find('agents', {}, { cols: ['id', 'name'] })).map((a) => [a.id, a.name]));
  return rows.map((r) => ({ ...r, agent_name: agents.get(r.agent_id) ?? r.agent_slug, flags: r.flags ?? [] }));
}

export async function getRun(ctx: Ctx, user: AxUser, id: string) {
  const r = await ctx.db.one('runs', { eq: { id } });
  if (!r) throw new AxError(404, '실행 기록을 찾을 수 없습니다.');
  acl.assertSee(user, r.visibility);
  const a = await ctx.db.one('agents', { eq: { id: r.agent_id } });
  return { ...r, agent_name: a?.name ?? r.agent_slug, flags: r.flags ?? [] };
}
