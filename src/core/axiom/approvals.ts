// 승인 게이트 3단:
//   auto  자동 실행 — 기록만 남김
//   post  사후 보고 — 실행 후 결과를 사람이 확인(확인·수정 요구·반려)
//   pre   사전 승인 — 사람이 승인해야 실행
// 결재 카드의 종류(kind)별 후속 처리는 각 모듈이 handler 로 등록한다.
import * as acl from './acl';
import type { Row } from './db';
import { audit, withNames } from './store';
import type { AxUser, Ctx, Instance, Tier } from './types';
import { AxError, newId, now } from './util';

export const TIERS: Record<Tier, string> = { auto: '자동 실행', post: '사후 보고', pre: '사전 승인' };
export const ACTIONS = { approve: '승인', revise: '수정 요구', reject: '반려' } as const;
export type Action = keyof typeof ACTIONS;
type Handler = (ctx: Ctx, ap: Row, user: AxUser, action: Action, comment: string) => Promise<unknown>;
const handlers: Record<string, Handler> = {};

export function registerHandler(kind: string, fn: Handler) {
  handlers[kind] = fn;
}

export function policyTier(inst: Instance, key: string, fallback: Tier = 'post'): Tier {
  const t = inst.approval_policy?.[key] as Tier;
  return TIERS[t] ? t : fallback;
}

function out(ctx: Ctx, a: Row): Row {
  return { ...a, payload: a.payload ?? {}, tier_label: TIERS[a.tier as Tier], team_label: ctx.inst.teams.find((t) => t.key === a.team)?.label ?? a.team, visibility_label: acl.label(a.visibility, ctx.inst) };
}

type NewApproval = { kind: string; tier: Tier; team?: string | null; title: string; summary?: string; payload?: Row; ref_type?: string | null; ref_id?: string | null; visibility?: string; requested_by?: string };

export async function create(ctx: Ctx, a: NewApproval) {
  if (!TIERS[a.tier]) throw new Error(`잘못된 승인 단계: ${a.tier}`);
  const id = newId('ap_');
  await ctx.db.insert('approvals', {
    id, kind: a.kind, tier: a.tier, team: a.team ?? null, title: a.title, summary: a.summary ?? '', payload: a.payload ?? {}, ref_type: a.ref_type ?? null,
    ref_id: a.ref_id ?? null, visibility: a.visibility ?? 'org', status: a.tier === 'auto' ? 'done' : 'pending', requested_by: a.requested_by ?? 'system',
    decided_by: null, decision: null, decision_comment: null, created_at: now(), decided_at: null,
  });
  return out(ctx, (await ctx.db.one('approvals', { eq: { id } }))!);
}

// 누가 결재할 수 있나: 사전 승인·경영 결재는 관리자, 사후 보고는 관리자 또는 해당 팀 팀장
export function canDecide(user: AxUser, a: Row): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'lead' && a.tier === 'post' && !!a.team && user.teams.includes(a.team);
}

const TIER_ORDER: Record<string, number> = { pre: 0, post: 1 };

export async function list(ctx: Ctx, user: AxUser, q: { status?: string; limit?: number } = {}) {
  const status = q.status || 'pending';
  const where = { ...acl.filter(user), ...(status !== 'all' ? { eq: { status } } : {}) };
  const rows = await ctx.db.find('approvals', where, { order: [['created_at', 'desc']], limit: Math.min(Number(q.limit) || 100, 300) });
  const named = await withNames(ctx, rows, 'decided_by', 'decided_by_name');
  return named
    .sort((x, y) => (TIER_ORDER[x.tier] ?? 2) - (TIER_ORDER[y.tier] ?? 2))
    .map((a) => ({ ...out(ctx, a), can_decide: canDecide(user, a) }));
}

export async function get(ctx: Ctx, user: AxUser, id: string): Promise<Row> {
  const a = await ctx.db.one('approvals', { eq: { id } });
  if (!a) throw new AxError(404, '결재 건을 찾을 수 없습니다.');
  acl.assertSee(user, a.visibility);
  const [named] = await withNames(ctx, [a], 'decided_by', 'decided_by_name');
  return { ...out(ctx, named), can_decide: canDecide(user, a) };
}

export async function decide(ctx: Ctx, user: AxUser, id: string, p: { action?: string; comment?: string }) {
  const action = p.action as Action;
  const comment = String(p.comment ?? '');
  if (!ACTIONS[action]) throw new AxError(400, '처리 방법은 승인·수정 요구·반려 중 하나입니다.');
  const a = await get(ctx, user, id);
  if (a.status !== 'pending') throw new AxError(409, '이미 처리된 결재입니다.');
  if (!a.can_decide) throw new AxError(403, '이 결재를 처리할 권한이 없습니다.');
  if (action === 'revise' && !comment.trim()) throw new AxError(400, '무엇을 고쳐야 하는지 적어 주세요.');
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revise';
  const n = await ctx.db.update('approvals', { eq: { id, status: 'pending' } }, { status, decision: action, decision_comment: comment, decided_by: user.id, decided_at: now() });
  if (n !== 1) throw new AxError(409, '이미 처리된 결재입니다.');
  await audit(ctx, user, `approval.${action}`, id, `${a.title}${comment ? ' — ' + comment : ''}`);
  const h = handlers[a.kind];
  const result = h ? await h(ctx, { ...a, status }, user, action, comment) : null;
  return { approval: await get(ctx, user, id), result };
}

export async function supersede(ctx: Ctx, refType: string, refId: string) {
  await ctx.db.update('approvals', { eq: { ref_type: refType, ref_id: refId, status: 'pending' } }, { status: 'superseded', decided_at: now() });
}
