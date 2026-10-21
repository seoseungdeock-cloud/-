// 작업지시: 승인된 경영 판단을 팀별 일감으로 쪼개고(작업 분배 에이전트), 팀 에이전트가 수행한다.
// 팀별 승인 정책(사전 승인/사후 보고/자동)에 따라 사람의 확인을 거친다.
// 외부로 나가는 행위(발행·배포·발송)는 실행하지 않고 '외부 실행 승인' 카드로만 남긴다.
import * as acl from './acl';
import * as approvals from './approvals';
import type { Row } from './db';
import { runAgent } from './runner';
import * as store from './store';
import type { AxUser, Ctx, Tier } from './types';
import { AxError, clip, newId, now } from './util';

export const STATUS: Record<string, string> = {
  awaiting_approval: '사전 승인 대기', queued: '대기', running: '수행 중', review: '결과 확인 대기',
  done: '완료', failed: '실패', cancelled: '취소', rejected: '반려',
};
const HR_NOTICE = '> **참고자료** — 이 결과물은 사람의 판단을 돕기 위한 AI 분석입니다. 채용·평가·인사 조치에 관한 최종 결정은 반드시 사람이 하며, AI 결과만으로 결정하지 않습니다.\n\n';

const sensitiveTeams = (ctx: Ctx) => new Set(ctx.inst.sensitive_teams || ['hr']);
const teamOf = (ctx: Ctx, key: string | null | undefined) => (ctx.inst.teams || []).find((t) => t.key === key) || null;

function out(ctx: Ctx, w: Row): Row {
  return { ...w, notes: w.notes ?? [], status_label: STATUS[w.status] || w.status, team_label: teamOf(ctx, w.team)?.label || w.team, visibility_label: acl.label(w.visibility, ctx.inst), tier_label: approvals.TIERS[w.tier as Tier] };
}

export async function get(ctx: Ctx, user: AxUser, id: string) {
  const w = await ctx.db.one('work_orders', { eq: { id } });
  if (!w) throw new AxError(404, '작업지시를 찾을 수 없습니다.');
  acl.assertSee(user, w.visibility);
  return out(ctx, w);
}

export async function list(ctx: Ctx, user: AxUser, q: { status?: string; team?: string; council_id?: string } = {}) {
  const eq: Row = {};
  if (q.status) eq.status = q.status;
  if (q.team) eq.team = q.team;
  if (q.council_id) eq.council_id = q.council_id;
  const rows = await ctx.db.find('work_orders', { ...acl.filter(user), eq }, { order: [['updated_at', 'desc']], limit: 200 });
  return rows.map((w) => out(ctx, w));
}

export async function create(ctx: Ctx, user: AxUser, p: { team?: string; title?: string; detail?: string; deliverable?: string; council_id?: string | null; visibility?: string }) {
  const t = teamOf(ctx, p.team);
  if (!t) throw new AxError(400, `없는 팀입니다: ${p.team}`);
  if (!t.agent) throw new AxError(400, `${t.label} 팀에 연결된 에이전트가 없습니다. 인스턴스 설정을 확인하세요.`);
  const title = String(p.title || '').trim();
  if (!title) throw new AxError(400, '작업 제목을 입력하세요.');
  const sensitive = sensitiveTeams(ctx).has(t.key);
  const vis = sensitive ? 'confidential' : acl.normalize(p.visibility || `team:${t.key}`, ctx.inst);
  const tier: Tier = sensitive ? 'pre' : approvals.policyTier(ctx.inst, `work_order:${t.key}`, 'post');
  const id = newId('w_');
  await ctx.db.insert('work_orders', {
    id, council_id: p.council_id ?? null, team: t.key, agent_slug: t.agent, title: clip(title, 200), detail: String(p.detail ?? ''), deliverable: String(p.deliverable ?? ''),
    notes: [], status: tier === 'pre' ? 'awaiting_approval' : 'queued', tier, run_id: null, deliverable_doc_id: null, visibility: vis, created_at: now(), updated_at: now(),
  });
  await store.audit(ctx, user, 'work_order.create', id, `${t.label}: ${title}`);
  if (tier === 'pre') {
    await approvals.create(ctx, {
      kind: 'work_order_pre', tier: 'pre', team: t.key, title: `[${t.label}] 실행 승인: ${clip(title, 80)}`, summary: clip(p.detail, 300),
      payload: { work_order_id: id }, ref_type: 'work_order', ref_id: id, visibility: vis, requested_by: user.id,
    });
  }
  return out(ctx, (await ctx.db.one('work_orders', { eq: { id } }))!);
}

/** 사람이 직접 만든 작업지시: 대기 상태면 바로 수행을 시작 */
export async function createAndDispatch(ctx: Ctx, user: AxUser, p: Parameters<typeof create>[2]) {
  if (!['admin', 'lead'].includes(user.role)) throw new AxError(403, '작업지시는 관리자·팀장이 만들 수 있습니다.');
  const w = await create(ctx, user, p);
  if (w.status === 'queued') ctx.spawn({ type: 'work', workOrderId: w.id, userId: user.id, feedback: null });
  return w;
}

/** 승인된 위원회 최종안을 팀별 작업지시로 쪼갠다 (백그라운드 일) */
export async function planFromCouncil(ctx: Ctx, council: Row, strategy: Row, user: AxUser, comment: string) {
  const planner = ctx.inst.council?.agents?.planner || 'planner';
  const teams = (ctx.inst.teams || []).filter((t) => t.agent).map((t) => ({ key: t.key, label: t.label }));
  const r = await runAgent(ctx, {
    slug: planner, mode: 'plan', user, visibility: council.visibility, councilId: council.id,
    input: { strategy, approval_comment: comment || '', conditions: council.result?.final?.conditions || [], teams },
  });
  const items = (Array.isArray(r.output.work_orders) ? r.output.work_orders : []).slice(0, ctx.inst.council?.max_work_orders || 12);
  const created = [];
  // 승인된 지시는 수행할 팀이 볼 수 있어야 한다(대표 승인 = 해당 팀에 지시 공유를 허락한 것).
  // 단, 위원회가 사건·기밀 등급이면 그 등급을 그대로 물려받는다.
  const strict = ['case', 'confidential'].includes(acl.parse(council.visibility).level);
  for (const it of items) {
    if (!teamOf(ctx, it.team)) continue;
    try {
      created.push(
        await create(ctx, user, {
          team: it.team, title: it.title, detail: [it.detail, it.due ? `기한: ${it.due}` : ''].filter(Boolean).join('\n'), deliverable: it.deliverable || '',
          council_id: council.id, visibility: strict ? council.visibility : `team:${it.team}`,
        }),
      );
    } catch {
      // 잘못된 항목은 건너뜀
    }
  }
  const c = await ctx.db.one('councils', { eq: { id: council.id } });
  await ctx.db.update('councils', { eq: { id: council.id } }, { result: { ...(c?.result ?? {}), plan: { run_id: r.run_id, work_order_ids: created.map((w) => w.id), at: now() } }, updated_at: now() });
  for (const w of created) if (w.status === 'queued') ctx.spawn({ type: 'work', workOrderId: w.id, userId: user.id, feedback: null });
  return created;
}

export async function execute(ctx: Ctx, user: AxUser, id: string, feedback: string | null = null) {
  const w = await ctx.db.one('work_orders', { eq: { id } });
  if (!w) throw new AxError(404, '작업지시를 찾을 수 없습니다.');
  const n = await ctx.db.update('work_orders', { eq: { id, status: 'queued' } }, { status: 'running', updated_at: now() });
  if (n !== 1) throw new AxError(409, '대기 중인 작업만 수행할 수 있습니다.');
  const t = teamOf(ctx, w.team);
  const council = w.council_id ? await ctx.db.one('councils', { eq: { id: w.council_id } }) : null;
  const strat = council?.result?.final ?? null;
  const prev = w.deliverable_doc_id ? (await ctx.db.one('documents', { eq: { id: w.deliverable_doc_id } }))?.body : null;
  let r;
  try {
    r = await runAgent(ctx, {
      slug: w.agent_slug, mode: 'execute', user, visibility: w.visibility, councilId: w.council_id, workOrderId: id,
      input: {
        work_order: { title: w.title, detail: w.detail, deliverable: w.deliverable, team: t?.label || w.team },
        strategy_context: strat ? { council: council!.title, recommended: strat.recommended, summary: strat.summary, conditions: strat.conditions } : null,
        notes: (w.notes ?? []).map((x: Row) => x.text),
        feedback,
        previous_output: feedback ? prev : null,
      },
    });
  } catch (e) {
    await ctx.db.update('work_orders', { eq: { id } }, { status: 'failed', run_id: (e as AxError).runId || null, updated_at: now() });
    throw e;
  }
  const o = r.output || {};
  let body = String(o.deliverable_markdown || '');
  if (sensitiveTeams(ctx).has(w.team) && !body.startsWith('> **참고자료**')) body = HR_NOTICE + body;
  if (o.cost_estimate?.total != null) body += `\n\n---\n**예상 비용:** ${Number(o.cost_estimate.total).toLocaleString('ko-KR')} ${o.cost_estimate.unit || '원'}`;
  if (o.next_steps?.length) body += `\n\n**다음 단계**\n${o.next_steps.map((s: string) => `- ${s}`).join('\n')}`;
  if (r.flags?.length) body += `\n\n**규정 점검 필요**\n${r.flags.map((f) => `- ${f.label} (${f.basis})`).join('\n')}`;
  let docId = w.deliverable_doc_id;
  const title = clip(o.title || w.title, 200);
  if (docId) {
    const d = await ctx.db.one('documents', { eq: { id: docId } });
    const rev = (d?.rev ?? 1) + 1;
    await ctx.db.update('documents', { eq: { id: docId } }, { title, body, rev, updated_at: now(), run_id: r.run_id });
    await ctx.db.insert('doc_revisions', { doc_id: docId, rev, title, body, edited_by: `agent:${w.agent_slug}`, at: now() });
  } else {
    docId = (await store.createDoc(ctx, user, { kind: 'deliverable', title, body, visibility: w.visibility, run_id: r.run_id, ref_type: 'work_order', ref_id: id })).id;
  }
  await ctx.db.update('work_orders', { eq: { id } }, { status: w.tier === 'auto' ? 'done' : 'review', run_id: r.run_id, deliverable_doc_id: docId, updated_at: now() });
  if (w.tier !== 'auto') {
    await approvals.supersede(ctx, 'work_order_result', id);
    await approvals.create(ctx, {
      kind: 'work_order_result', tier: 'post', team: w.team, title: `[${t?.label || w.team}] 결과 확인: ${clip(w.title, 80)}`,
      summary: clip(String(o.deliverable_markdown || '').replace(/[#*>`|]/g, ' ').replace(/\s+/g, ' ').trim(), 180),
      payload: { work_order_id: id, doc_id: docId, decisions_needed: o.decisions_needed || [], flags: r.flags || [], feedback },
      ref_type: 'work_order_result', ref_id: id, visibility: w.visibility, requested_by: 'system',
    });
  }
  for (const ea of (o.external_actions || []).slice(0, 5)) {
    await approvals.create(ctx, {
      kind: 'external_action', tier: approvals.policyTier(ctx.inst, 'external_action', 'pre'), team: w.team, title: `[외부 실행] ${clip(ea.action, 80)}`,
      summary: clip(ea.reason, 200), payload: { work_order_id: id, action: ea }, ref_type: 'work_order', ref_id: id, visibility: w.visibility, requested_by: 'system',
    });
  }
  return out(ctx, (await ctx.db.one('work_orders', { eq: { id } }))!);
}

async function addNote(ctx: Ctx, user: AxUser, id: string, text: string) {
  const w = await ctx.db.one('work_orders', { eq: { id } });
  await ctx.db.update('work_orders', { eq: { id } }, { notes: [...(w?.notes ?? []), { at: now(), by: user.name, text }], updated_at: now() });
}

// 사람이 직접 다시 실행 (지시 추가 가능)
export async function runNow(ctx: Ctx, user: AxUser, id: string, p: { instruction?: string } = {}) {
  const w = await get(ctx, user, id);
  if (!['admin', 'lead'].includes(user.role)) throw new AxError(403, '작업 실행은 관리자·팀장만 할 수 있습니다.');
  if (w.status === 'awaiting_approval') throw new AxError(409, '사전 승인 대기 중입니다. 결재함에서 승인하세요.');
  if (w.status === 'running') throw new AxError(409, '이미 수행 중입니다.');
  const instruction = String(p.instruction ?? '').trim();
  if (instruction) await addNote(ctx, user, id, instruction);
  await approvals.supersede(ctx, 'work_order_result', id);
  await ctx.db.update('work_orders', { eq: { id } }, { status: 'queued', updated_at: now() });
  ctx.spawn({ type: 'work', workOrderId: id, userId: user.id, feedback: instruction || null });
  return get(ctx, user, id);
}

approvals.registerHandler('work_order_pre', async (ctx, ap, user, action, comment) => {
  const id = ap.payload.work_order_id;
  if (action === 'reject') {
    await ctx.db.update('work_orders', { eq: { id } }, { status: 'cancelled', updated_at: now() });
    return { cancelled: true };
  }
  if (comment) await addNote(ctx, user, id, comment);
  if (action === 'revise') {
    // 지시를 덧붙인 채 다시 사전 승인 요청
    const w = (await ctx.db.one('work_orders', { eq: { id } }))!;
    await approvals.create(ctx, {
      kind: 'work_order_pre', tier: 'pre', team: w.team, title: ap.title, summary: `${clip(w.detail, 200)}\n[수정 지시] ${comment}`,
      payload: { work_order_id: id }, ref_type: 'work_order', ref_id: id, visibility: w.visibility, requested_by: user.id,
    });
    return { re_requested: true };
  }
  await ctx.db.update('work_orders', { eq: { id } }, { status: 'queued', updated_at: now() });
  ctx.spawn({ type: 'work', workOrderId: id, userId: user.id, feedback: null });
  return { executing: true };
});

approvals.registerHandler('work_order_result', async (ctx, ap, user, action, comment) => {
  const id = ap.payload.work_order_id;
  if (action === 'approve') {
    await ctx.db.update('work_orders', { eq: { id } }, { status: 'done', updated_at: now() });
    return { done: true };
  }
  if (action === 'reject') {
    await ctx.db.update('work_orders', { eq: { id } }, { status: 'rejected', updated_at: now() });
    return { rejected: true };
  }
  await addNote(ctx, user, id, comment);
  await ctx.db.update('work_orders', { eq: { id } }, { status: 'queued', updated_at: now() });
  ctx.spawn({ type: 'work', workOrderId: id, userId: user.id, feedback: comment });
  return { revising: true };
});

approvals.registerHandler('external_action', async () => ({
  note: '외부 실행(발행·배포·발송)은 아직 연결되어 있지 않습니다. 승인 기록만 남았으며 실제 실행은 담당자가 진행하세요.',
}));
