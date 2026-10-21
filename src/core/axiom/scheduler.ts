// 정기 보고: 정해진 시각마다 팀별 활동을 모아 보고 에이전트가 요약한다.
// 원칙: 보고는 '결정이 필요한 것' 중심. 활동이 없으면 보고하지 않고, 결정 사항이 있을 때만 결재함에 올린다.
import * as approvals from './approvals';
import type { Row } from './db';
import { runAgent } from './runner';
import * as store from './store';
import type { AxUser, Ctx } from './types';
import { AxError, KST_MS, kstDate, newId, now } from './util';

const DOW: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

type Spec = { kind: 'daily' | 'weekdays' | 'weekly'; h: number; min: number; dow?: number };

// 'daily 18:00' | 'weekdays 18:00' | 'weekly 월 09:00'
export function parseSpec(spec: unknown): Spec | null {
  const s = String(spec || '').trim().toLowerCase();
  let m = s.match(/^(daily|weekdays)\s+([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m) return { kind: m[1] as Spec['kind'], h: +m[2], min: +m[3] };
  m = s.match(/^weekly\s+(\S+)\s+([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m && DOW[m[1]] !== undefined) return { kind: 'weekly', dow: DOW[m[1]], h: +m[2], min: +m[3] };
  return null;
}

export function describe(spec: string): string {
  const p = parseSpec(spec);
  if (!p) return spec;
  const hm = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
  if (p.kind === 'daily') return `매일 ${hm}`;
  if (p.kind === 'weekdays') return `평일 ${hm}`;
  return `매주 ${'일월화수목금토'[p.dow!]}요일 ${hm}`;
}

// 지금 시점 이전의 가장 최근 예정 시각(UTC Date)
export function lastDue(spec: string, at = new Date()): Date | null {
  const p = parseSpec(spec);
  if (!p) return null;
  const k = new Date(at.getTime() + KST_MS); // KST 벽시계
  for (let back = 0; back < 8; back++) {
    const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - back, p.h, p.min));
    const dow = d.getUTCDay();
    const ok = p.kind === 'daily' || (p.kind === 'weekdays' && dow >= 1 && dow <= 5) || (p.kind === 'weekly' && dow === p.dow);
    const utc = new Date(d.getTime() - KST_MS);
    if (ok && utc <= at) return utc;
  }
  return null;
}

const teamOf = (ctx: Ctx, key: string | null) => (ctx.inst.teams || []).find((t) => t.key === key) || null;

export async function list(ctx: Ctx) {
  const rows = await ctx.db.find('schedules', {}, { order: [['created_at', 'asc']] });
  return rows.map((s) => ({ ...s, label: describe(s.spec), team_label: s.team ? teamOf(ctx, s.team)?.label : '전체' }));
}

export async function create(ctx: Ctx, user: AxUser, p: { name?: string; team?: string | null; spec?: string }) {
  if (user.role !== 'admin') throw new AxError(403, '보고 일정은 관리자만 만들 수 있습니다.');
  const name = String(p.name || '').trim();
  if (!name) throw new AxError(400, '이름을 입력하세요.');
  if (!parseSpec(p.spec)) throw new AxError(400, "주기 형식: 'daily 18:00', 'weekdays 18:00', 'weekly 월 09:00'");
  if (p.team && !teamOf(ctx, p.team)) throw new AxError(400, '없는 팀입니다.');
  const id = newId('s_');
  await ctx.db.insert('schedules', { id, name, team: p.team || null, spec: String(p.spec).trim(), enabled: true, last_run_at: null, created_by: user.id, created_at: now() });
  await store.audit(ctx, user, 'schedule.create', id, `${name} ${p.spec}`);
  return ctx.db.one('schedules', { eq: { id } });
}

export async function toggle(ctx: Ctx, user: AxUser, id: string, enabled: boolean) {
  if (user.role !== 'admin') throw new AxError(403, '관리자만 바꿀 수 있습니다.');
  await ctx.db.update('schedules', { eq: { id } }, { enabled });
}

export async function runReport(ctx: Ctx, sched: Row, { force = false } = {}) {
  const since = sched.last_run_at || sched.created_at;
  const until = now();
  const teamAgents = sched.team ? (await ctx.db.find('agents', { eq: { team: sched.team } }, { cols: ['slug'] })).map((a) => a.slug) : null;
  const runs = await ctx.db.find('runs', { gt: { started_at: since }, lte: { started_at: until }, ...(teamAgents ? { in: { agent_slug: teamAgents } } : {}) }, { order: [['started_at', 'asc']], limit: 200, cols: ['agent_slug', 'mode', 'status', 'started_at'] });
  const wos = await ctx.db.find('work_orders', { gt: { updated_at: since }, ...(sched.team ? { eq: { team: sched.team } } : {}) }, { limit: 100, cols: ['title', 'status', 'team', 'updated_at'] });
  const pend = await ctx.db.find('approvals', { eq: { status: 'pending', ...(sched.team ? { team: sched.team } : {}) } }, { limit: 50, cols: ['title', 'tier', 'created_at'] });
  // 같은 보고가 두 번 돌지 않게: 내가 본 마지막 실행 시각 그대로일 때만 가져간다
  const claimed = await ctx.db.update('schedules', { eq: { id: sched.id, last_run_at: sched.last_run_at ?? null } }, { last_run_at: until });
  if (!claimed) return { skipped: true, reason: '이미 다른 실행이 처리함' };
  if (!force && !runs.length && !wos.length && !pend.length) return { skipped: true, reason: '보고할 활동 없음' };

  const owner = await ctx.owner();
  if (!owner) return { skipped: true, reason: '관리자 계정 없음' };
  const team = sched.team ? teamOf(ctx, sched.team) : null;
  const vis = sched.team ? `team:${sched.team}` : ctx.inst.council?.default_visibility || 'org';
  const r = await runAgent(ctx, {
    slug: ctx.inst.council?.agents?.reporter || 'reporter', mode: 'report', user: owner, visibility: vis,
    input: { team: team?.label || '전체', period: { from: since, to: until }, activity: { runs, work_orders: wos, pending_approvals: pend } },
  });
  const o = r.output || {};
  const sec = (t: string, a: unknown[]) => (a?.length ? `\n### ${t}\n${a.map((x) => `- ${typeof x === 'string' ? x : (x as Row).question || JSON.stringify(x)}`).join('\n')}\n` : '');
  const body = `## ${team?.label || '전체'} 정기 보고 (${kstDate()})\n\n${o.summary || ''}\n${sec('결정이 필요한 사항', o.decisions_needed)}${sec('완료', o.done)}${sec('진행 중', o.in_progress)}${sec('위험', o.risks)}`;
  const doc = await store.createDoc(ctx, owner, { kind: 'report', title: `[${sched.name}] ${kstDate()}`, body, visibility: vis, run_id: r.run_id, ref_type: 'schedule', ref_id: sched.id });
  let ap = null;
  if (o.decisions_needed?.length) {
    ap = await approvals.create(ctx, {
      kind: 'report', tier: approvals.policyTier(ctx.inst, 'report', 'post'), team: sched.team, title: `[정기 보고] ${sched.name}`, summary: o.summary || '',
      payload: { doc_id: doc.id, decisions_needed: o.decisions_needed }, ref_type: 'report', ref_id: doc.id, visibility: vis,
    });
  }
  return { doc_id: doc.id, approval_id: ap?.id || null };
}

/** 예정 시각이 지난 보고를 찾아 각각 따로 실행 (서버: 몇 분마다 예약 작업이 부름) */
export async function tick(ctx: Ctx) {
  const at = new Date();
  let n = 0;
  for (const s of await ctx.db.find('schedules', { eq: { enabled: true } })) {
    const due = lastDue(s.spec, at);
    if (!due) continue;
    if (new Date(s.last_run_at || s.created_at) < due) {
      ctx.spawn({ type: 'report', scheduleId: s.id, force: false });
      n++;
    }
  }
  return n;
}

approvals.registerHandler('report', async () => ({ acknowledged: true }));
