// 예측 원장: 예측자가 낸 숫자를 저장해 두었다가, 실적 확인 시점에 실제 값과 비교해 적중률을 쌓는다.
// 적중률은 다음 경영위원회에서 판정자에게 '예측자 성적표'로 제공된다.
import * as acl from './acl';
import type { Row } from './db';
import { audit } from './store';
import type { AxUser, Ctx } from './types';
import { AxError, koNum, kstDate, newId, now, num } from './util';

export async function recordFromStrategy(ctx: Ctx, council: Row, strategy: Row, meta: Row = {}) {
  const ids: string[] = [];
  const ins = async (metric: string, unit: string, horizon: string | null, c: number, b: number, o: number) => {
    const id = newId('f_');
    await ctx.db.insert('forecasts', {
      id, council_id: council.id, strategy_name: strategy.name, metric, unit, horizon, conservative: c, base: b, optimistic: o, check_date: strategy.check_date || null,
      assumptions: strategy.assumptions || [], provider: meta.provider || null, model: meta.model || null, agent_version: meta.agent_version || null,
      actual: null, actual_note: null, actual_by: null, actual_at: null, visibility: council.visibility, created_at: now(),
    });
    ids.push(id);
  };
  const r = strategy.revenue || {};
  const base = num(r.base);
  if (base != null) await ins(r.metric || '매출', r.unit || '원', r.horizon || null, num(r.conservative) ?? base, base, num(r.optimistic) ?? base);
  const cost = num(strategy.cost?.total);
  if (cost != null) await ins('투입 비용', strategy.cost?.unit || '원', r.horizon || null, cost, cost, cost);
  return ids;
}

function enrich(f: Row) {
  const out: Row = { ...f, assumptions: f.assumptions ?? [] };
  const actual = f.actual == null ? null : Number(f.actual);
  const base = f.base == null ? null : Number(f.base);
  if (actual != null && base != null && actual !== 0) {
    out.ape = Math.abs(actual - base) / Math.abs(actual);
    out.in_range = actual >= Math.min(f.conservative, f.optimistic) && actual <= Math.max(f.conservative, f.optimistic);
  }
  out.due = f.actual == null && !!f.check_date && f.check_date <= kstDate();
  return out;
}

export async function list(ctx: Ctx, user: AxUser, q: { council_id?: string } = {}) {
  const where = { ...acl.filter(user), ...(q.council_id ? { eq: { council_id: q.council_id } } : {}) };
  const rows = await ctx.db.find('forecasts', where, { order: [['created_at', 'desc']], limit: 300 });
  const titles = new Map((await ctx.db.find('councils', {}, { cols: ['id', 'title'] })).map((c) => [c.id, c.title]));
  return rows.map((f) => enrich({ ...f, council_title: titles.get(f.council_id) ?? null }));
}

function summarize(rows: Row[]) {
  const done = rows.filter((r) => r.ape != null);
  const by: Record<string, { model: string; n: number; ape: number; hits: number }> = {};
  for (const r of done) {
    const k = `${r.provider || '?'}:${r.model || '?'}`;
    by[k] ??= { model: k, n: 0, ape: 0, hits: 0 };
    by[k].n++;
    by[k].ape += r.ape;
    by[k].hits += r.in_range ? 1 : 0;
  }
  return {
    total: rows.length,
    measured: done.length,
    mape: done.length ? done.reduce((s, r) => s + r.ape, 0) / done.length : null,
    hit_rate: done.length ? done.filter((r) => r.in_range).length / done.length : null,
    due: rows.filter((r) => r.due).length,
    by_model: Object.values(by).map((b) => ({ model: b.model, n: b.n, mape: b.ape / b.n, hit_rate: b.hits / b.n })),
  };
}

export async function summary(ctx: Ctx, user: AxUser) {
  return summarize(await list(ctx, user));
}

// 판정자에게 넘길 성적표 (조직 전체 기준, 매출 지표만)
export async function trackRecord(ctx: Ctx) {
  const rows = (await ctx.db.find('forecasts', { neq: { metric: '투입 비용' } })).map(enrich);
  const s = summarize(rows);
  const pct = (v: number) => Math.round(v * 1000) / 10;
  return {
    measured: s.measured,
    mape: s.mape == null ? null : pct(s.mape),
    hit_rate: s.hit_rate == null ? null : pct(s.hit_rate),
    note: s.measured ? `과거 예측 ${s.measured}건 기준: 평균 오차 ${pct(s.mape!)}%, 보수~낙관 범위 적중 ${pct(s.hit_rate!)}%` : '아직 실적과 비교된 예측이 없음',
  };
}

export async function recordActual(ctx: Ctx, user: AxUser, id: string, p: { actual?: unknown; note?: string }) {
  if (!['admin', 'lead'].includes(user.role)) throw new AxError(403, '실적 입력은 관리자·팀장만 할 수 있습니다.');
  const f = await ctx.db.one('forecasts', { eq: { id } });
  if (!f) throw new AxError(404, '예측을 찾을 수 없습니다.');
  acl.assertSee(user, f.visibility);
  const v = koNum(p.actual);
  if (v == null) throw new AxError(400, '실적은 숫자로 입력하세요(예: 1300000000 또는 13억).');
  await ctx.db.update('forecasts', { eq: { id } }, { actual: v, actual_note: p.note ?? '', actual_by: user.id, actual_at: now() });
  await audit(ctx, user, 'ledger.actual', id, `${f.strategy_name} ${f.metric}: 예측 ${f.base} / 실적 ${v}`);
  return enrich((await ctx.db.one('forecasts', { eq: { id } }))!);
}
