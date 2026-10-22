// 경영위원회: 회의록 + 회사 상태 + 목표 →
//   1 안건 정리 → 2 비판자·옹호자 토론 → 3 판정자 방향 판정 → 4 예측자 전략 수립(매출·비용 3시나리오)
//   → 5 비판자 검증(가정 공격 + 규정 점검) → 6 예측자 수정 → 7 판정자 최종안 → 대표 결재
// 사람은 어느 단계에서든 '지시'를 넣을 수 있고, 지시는 다음 단계부터 모든 에이전트에게 최우선으로 전달된다.
// 단계마다 따로 실행됩니다(서버 함수 한 번에 한 단계) — 실제 AI로 오래 걸려도 제한 시간에 걸리지 않게.
import * as acl from './acl';
import * as approvals from './approvals';
import type { Row } from './db';
import { scan, type Flag } from './guardrails';
import * as ledger from './ledger';
import { listRuns, runAgent } from './runner';
import * as store from './store';
import type { AxUser, Ctx } from './types';
import { AxError, arr, clip, koNum, limiter, newId, now, num } from './util';
import { planFromCouncil } from './workorders';

export const STEPS = [
  { key: 'agenda', label: '안건 정리' },
  { key: 'debate', label: '비판·옹호 토론' },
  { key: 'direction', label: '방향 판정' },
  { key: 'forecast', label: '전략 수립(예측자)' },
  { key: 'verify', label: '검증(비판자)' },
  { key: 'revise', label: '전략 수정(예측자)' },
  { key: 'final', label: '최종안(판정자)' },
];
export const STATUS: Record<string, string> = { running: '진행 중', awaiting_approval: '결재 대기', approved: '승인됨', rejected: '반려됨', failed: '실패', cancelled: '중단됨' };

// "항목,값,단위" / "항목: 값 단위" / 탭 구분 / JSON 모두 받는다
export function parseState(text: unknown): { metrics: { name: string; value: unknown; unit: string }[]; notes: string } {
  const t = String(text || '').trim();
  if (!t) return { metrics: [], notes: '' };
  let j: unknown = null;
  try {
    j = JSON.parse(t);
  } catch {
    j = null;
  }
  if (j && typeof j === 'object') {
    const o = j as Row;
    if (Array.isArray(o.metrics)) return { metrics: o.metrics, notes: o.notes || '' };
    return { metrics: Object.entries(o).map(([name, value]) => ({ name, value: num(value) ?? value, unit: '' })), notes: '' };
  }
  const metrics = [];
  const notes = [];
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^항목\s*[,\t]/.test(line)) continue;
    let parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map((s) => s.trim());
    if (parts.length < 2) {
      const k = line.match(/^(.+?)\s*[:：]\s*(.+)$/);
      parts = k ? [k[1], k[2]] : parts;
    }
    if (parts.length < 2 || !parts[0]) {
      notes.push(line);
      continue;
    }
    const name = parts[0];
    const rest = parts.slice(1);
    let unit = '';
    // 마지막 칸이 숫자가 아니면 단위로 본다 (천 단위 쉼표로 쪼개진 숫자는 다시 붙인다)
    if (rest.length > 1 && !/\d/.test(rest[rest.length - 1])) unit = rest.pop()!;
    let value = rest.join(',');
    if (!unit) {
      const vm = value.match(/^([\d,.-]+)\s*([^\d,.-].*)$/);
      if (vm && !/[조억만천]/.test(vm[2])) {
        value = vm[1];
        unit = vm[2];
      }
    }
    const n = koNum(value);
    if (n != null && !unit && /원/.test(value)) unit = '원';
    metrics.push({ name, value: n ?? value, unit });
  }
  return { metrics, notes: notes.join('\n') };
}

function slugs(ctx: Ctx) {
  return { secretary: 'secretary', critic: 'critic', advocate: 'advocate', judge: 'judge', forecaster: 'forecaster', planner: 'planner', ...(ctx.inst.council?.agents || {}) };
}

async function load(ctx: Ctx, id: string): Promise<Row> {
  const c = await ctx.db.one('councils', { eq: { id } });
  if (!c) throw new AxError(404, '경영위원회 기록을 찾을 수 없습니다.');
  return { ...c, result: c.result ?? {}, interventions: c.interventions ?? [], warnings: c.warnings ?? [] };
}

export async function get(ctx: Ctx, user: AxUser, id: string): Promise<Row> {
  const c = await load(ctx, id);
  acl.assertSee(user, c.visibility);
  const runs = await listRuns(ctx, user, { council_id: id, limit: 200 });
  const pending = await ctx.db.one('approvals', { eq: { ref_type: 'council', ref_id: id, status: 'pending' } });
  const [named] = await store.withNames(ctx, [c], 'created_by', 'created_by_name');
  const res: Row = c.result || {};
  const chosen = (res.revision?.strategies || res.proposal?.strategies || []).find((s: Row) => s.name === res.final?.recommended);
  return {
    ...named, steps: STEPS, status_label: STATUS[c.status], visibility_label: acl.label(c.visibility, ctx.inst), runs, pending_approval_id: pending?.id || null,
    record_md: toMarkdown(ctx, c, res, c.warnings || [], chosen),
    data_gaps: openGaps(c),
  };
}

export async function list(ctx: Ctx, user: AxUser) {
  const rows = await ctx.db.find('councils', acl.filter(user), {
    order: [['created_at', 'desc']],
    limit: 100,
    cols: ['id', 'title', 'status', 'step', 'visibility', 'created_at', 'updated_at', 'created_by'],
  });
  return (await store.withNames(ctx, rows, 'created_by', 'created_by_name')).map((c) => ({
    ...c,
    status_label: STATUS[c.status],
    step_label: STEPS.find((s) => s.key === c.step)?.label || '',
    visibility_label: acl.label(c.visibility, ctx.inst),
  }));
}

const NO_OBJECTIVE = '(따로 적지 않음: 회의록 내용으로 판단)';

async function launch(ctx: Ctx, id: string, step: string) {
  const token = newId('t_');
  await ctx.db.update('councils', { eq: { id } }, { status: 'running', step, run_token: token, error: null, updated_at: now() });
  ctx.spawn({ type: 'council', councilId: id, step, token });
}

export async function start(ctx: Ctx, user: AxUser, body: Row) {
  if (!['admin', 'lead'].includes(user.role)) throw new AxError(403, '경영위원회는 관리자·팀장이 열 수 있습니다.');
  const title = String(body.title || '').trim();
  if (!title) throw new AxError(400, '제목을 입력하세요.');
  // 회사 상태·목적·방향성은 선택 (승덕 2026-10-22): 비우면 회의록만으로 판단합니다
  const objective = String(body.objective || '').trim();
  const vis = acl.normalize(body.visibility || ctx.inst.council?.default_visibility || 'org', ctx.inst);
  if (!acl.canSee(user, vis)) throw new AxError(403, '내가 볼 수 없는 공개 등급으로는 위원회를 열 수 없습니다. 공개 등급을 바꾸세요.');

  let meeting;
  if (body.meeting_doc_id) meeting = await store.getDoc(ctx, user, body.meeting_doc_id);
  else if (String(body.meeting_text || '').trim().length >= 20) meeting = await store.createDoc(ctx, user, { kind: 'meeting', title: `${title} — 회의록`, body: body.meeting_text, visibility: vis });
  else throw new AxError(400, '회의록을 고르거나 20자 이상 붙여 넣으세요.');

  let stateDoc = null;
  if (body.state_doc_id) stateDoc = await store.getDoc(ctx, user, body.state_doc_id);
  else if (String(body.state_text || '').trim()) {
    stateDoc = await store.createDoc(ctx, user, { kind: 'state', title: `${title} — 회사 상태`, body: JSON.stringify(parseState(body.state_text), null, 2), visibility: vis });
  }

  const id = newId('cn_');
  await ctx.db.insert('councils', {
    id, title, meeting_doc_id: meeting.id, state_doc_id: stateDoc?.id || null, objective, status: 'running', step: 'agenda', result: {}, interventions: [], warnings: [],
    visibility: acl.inherit(vis, meeting.visibility, stateDoc?.visibility), record_doc_id: null, error: null, run_token: null, created_by: user.id, created_at: now(), updated_at: now(),
  });
  await store.audit(ctx, user, 'council.start', id, title);
  await launch(ctx, id, 'agenda');
  return get(ctx, user, id);
}

function normStrategies(o: Row) {
  return {
    data_gaps: arr<string>(o?.data_gaps),
    strategies: arr<Row>(o?.strategies)
      .filter((s) => s && s.name)
      .map((s) => ({
        name: String(s.name),
        summary: s.summary || '',
        team_actions: s.team_actions || {},
        cost: { total: num(s.cost?.total), unit: s.cost?.unit || '원', breakdown: arr(s.cost?.breakdown) },
        revenue: {
          metric: s.revenue?.metric || '매출', unit: s.revenue?.unit || '원', horizon: s.revenue?.horizon || '',
          conservative: num(s.revenue?.conservative), base: num(s.revenue?.base), optimistic: num(s.revenue?.optimistic),
        },
        assumptions: arr<Row>(s.assumptions),
        risks: arr<string>(s.risks),
        check_date: /^\d{4}-\d{2}-\d{2}$/.test(s.check_date || '') ? s.check_date : null,
      })),
  };
}

/** 한 단계 실행 (백그라운드 일). 끝나면 다음 단계를 따로 시작합니다. */
export async function runStep(ctx: Ctx, id: string, step: string, token: string) {
  let c = await load(ctx, id);
  if (c.status !== 'running' || c.run_token !== token || c.step !== step) return; // 중단됐거나 다시 실행으로 대체됨
  const S = slugs(ctx);
  const user = (await ctx.userById(c.created_by)) ?? { id: c.created_by, name: '', role: 'admin', teams: [] };
  const res: Row = c.result || {};
  const warnings = new Set<string>(c.warnings || []);
  const flags = new Map<string, Flag>((res.flags || []).map((f: Flag) => [`${f.id}|${f.excerpt}`, f]));
  const meeting = await ctx.db.one('documents', { eq: { id: c.meeting_doc_id } });
  const stateDoc = c.state_doc_id ? await ctx.db.one('documents', { eq: { id: c.state_doc_id } }) : null;
  let company_state: Row = { metrics: [], notes: '' };
  if (stateDoc) {
    try {
      company_state = JSON.parse(stateDoc.body);
    } catch {
      company_state = { metrics: [], notes: stateDoc.body };
    }
  }
  // '자료 넣기'로 보충한 자료는 회사 상태에, 나머지 개입은 사람의 지시로 넘깁니다
  const supplied = (c.interventions || []).filter((i: Row) => i.kind === 'data');
  if (supplied.length) company_state = { ...company_state, supplied_data: supplied.map((i: Row) => ({ item: i.gap, value: i.text })) };
  const human_instructions = (c.interventions || []).filter((i: Row) => i.kind !== 'data').map((i: Row) => i.text);
  c.objective = c.objective || NO_OBJECTIVE;
  const limit = limiter(ctx.inst.models?.concurrency || 4);
  const mine = async () => {
    const s = await ctx.db.one('councils', { eq: { id } });
    return !!s && s.status === 'running' && s.run_token === token;
  };
  const save = async (patch: Row = {}) => {
    if (!(await mine())) return false;
    await ctx.db.update('councils', { eq: { id, run_token: token } }, { result: { ...res, flags: [...flags.values()] }, warnings: [...warnings], updated_at: now(), ...patch });
    return true;
  };
  const call = async (slug: string, mode: string, input: unknown) => {
    const r = await runAgent(ctx, { slug, mode, input, user, visibility: c.visibility, councilId: id });
    if (r.note) warnings.add(r.note);
    for (const f of r.flags) flags.set(`${f.id}|${f.excerpt}`, { ...f, agent: r.agent.name, step: mode });
    return r;
  };

  try {
    if (step === 'agenda') {
      const r = await call(S.secretary, 'agenda', { meeting: { title: meeting?.title, text: meeting?.body }, objective: c.objective, company_state, human_instructions });
      const agenda = arr<Row>(r.output.agenda)
        .slice(0, ctx.inst.council?.max_agenda || 5)
        .map((a, k) => ({ id: a.id || `A${k + 1}`, title: String(a.title || `안건 ${k + 1}`), background: a.background || '' }));
      if (!agenda.length) throw new Error('회의록에서 안건을 찾지 못했습니다. 회의록 내용을 확인하세요.');
      res.minutes = { summary: r.output.summary || '', decisions_made: r.output.decisions_made || [], action_items: r.output.action_items || [] };
      res.agenda = agenda;
    }

    if (step === 'debate') {
      res.debates = {};
      const base = { meeting_summary: res.minutes?.summary, objective: c.objective, company_state, human_instructions };
      await Promise.all(
        res.agenda.map((a: Row) =>
          Promise.all([
            limit(() => call(S.critic, 'debate', { agenda_item: a, ...base }).then((r) => r.output).catch((e) => ({ error: (e as Error).message }))),
            limit(() => call(S.advocate, 'debate', { agenda_item: a, ...base }).then((r) => r.output).catch((e) => ({ error: (e as Error).message }))),
          ]).then(([critic, advocate]) => {
            res.debates[a.id] = { critic, advocate };
          }),
        ),
      );
      const ok = Object.values(res.debates as Record<string, Row>).filter((d) => !d.critic.error || !d.advocate.error).length;
      if (!ok) throw new Error('토론 단계의 에이전트 실행이 모두 실패했습니다.');
      for (const [aid, d] of Object.entries(res.debates as Record<string, Row>)) {
        if (d.critic.error) warnings.add(`안건 ${aid} 비판자 실행 실패: ${clip(d.critic.error, 120)}`);
        if (d.advocate.error) warnings.add(`안건 ${aid} 옹호자 실행 실패: ${clip(d.advocate.error, 120)}`);
      }
    }

    if (step === 'direction') {
      const items = res.agenda.map((a: Row) => ({ agenda: a, critic: res.debates?.[a.id]?.critic, advocate: res.debates?.[a.id]?.advocate }));
      const r = await call(S.judge, 'direction', { objective: c.objective, company_state, meeting_summary: res.minutes?.summary, items, human_instructions });
      res.direction = { overall_direction: r.output.overall_direction || '', directions: arr(r.output.directions) };
    }

    if (step === 'forecast') {
      const approved = arr<Row>(res.direction?.directions).filter((d) => d.decision !== '부');
      const r = await call(S.forecaster, 'propose', {
        objective: c.objective, company_state, overall_direction: res.direction?.overall_direction, directions: approved,
        track_record: await ledger.trackRecord(ctx), strategy_count: ctx.inst.council?.strategies || 3, human_instructions,
      });
      res.proposal = normStrategies(r.output);
      res.forecaster_provider = r.provider;
      const gaps = arr<string>(res.proposal.data_gaps).filter((g) => !supplied.some((i: Row) => i.gap === g));
      if (gaps.length) warnings.add(`${GAP_WARNING}${gaps.join(', ')}`);
      if (!res.proposal.strategies.length) throw new Error('예측자가 전략을 내지 못했습니다.');
    }

    if (step === 'verify') {
      const guardrail_flags = scan(ctx.inst, res.proposal.strategies);
      const r = await call(S.critic, 'verify', { objective: c.objective, company_state, strategies: res.proposal.strategies, guardrail_flags, human_instructions });
      res.verification = { overall: r.output.overall || '', challenges: arr(r.output.challenges), compliance: arr(r.output.compliance), missing_data: arr(r.output.missing_data), guardrail_flags };
      res.critic_provider = r.provider;
      if (r.provider !== 'mock' && r.provider === res.forecaster_provider) {
        warnings.add('비판자와 예측자가 같은 AI 제공자로 실행되었습니다. 서로 다른 제공자 키를 연결하면 같은 편향이 되풀이되는 것을 줄일 수 있습니다.');
      }
    }

    if (step === 'revise') {
      const r = await call(S.forecaster, 'revise', { objective: c.objective, company_state, strategies: res.proposal.strategies, verification: res.verification, human_instructions });
      const rv = normStrategies(r.output);
      res.revision = { ...rv, changes: arr(r.output.changes) };
      res.revision_meta = { provider: r.provider, model: r.model, agent_version: r.agent.version };
      if (!res.revision.strategies.length) res.revision.strategies = res.proposal.strategies;
    }

    if (step === 'final') {
      const strategies = res.revision?.strategies || res.proposal.strategies;
      const r = await call(S.judge, 'final', {
        objective: c.objective, overall_direction: res.direction?.overall_direction, strategies, verification: res.verification,
        track_record: await ledger.trackRecord(ctx), human_instructions,
      });
      res.final = {
        recommended: r.output.recommended || strategies[0]?.name, summary: r.output.summary || '', rationale: r.output.rationale || '',
        why_not_others: arr(r.output.why_not_others), conditions: arr(r.output.conditions), decisions_needed: arr(r.output.decisions_needed),
      };
    }
  } catch (e) {
    if (await save()) await ctx.db.update('councils', { eq: { id, run_token: token } }, { status: 'failed', error: clip((e as Error).message, 1000), updated_at: now() });
    return;
  }

  const i = STEPS.findIndex((s) => s.key === step);
  const next = STEPS[i + 1]?.key;
  if (next) {
    if (await save({ step: next })) ctx.spawn({ type: 'council', councilId: id, step: next, token });
    return;
  }
  if (!(await save())) return;

  // 최종안 → 기록 문서 + 결재 카드
  const strategies = res.revision?.strategies || res.proposal.strategies;
  const chosen = strategies.find((s: Row) => s.name === res.final.recommended) || strategies[0];
  c = await load(ctx, id);
  const md = toMarkdown(ctx, c, res, [...warnings], chosen);
  let recordId = c.record_doc_id;
  if (recordId) await store.systemUpdateBody(ctx, recordId, md);
  else recordId = (await store.createDoc(ctx, user, { kind: 'council', title: `[경영위원회] ${c.title}`, body: md, visibility: c.visibility, ref_type: 'council', ref_id: id })).id;
  await ctx.db.update('councils', { eq: { id } }, { record_doc_id: recordId, step: 'final', updated_at: now() });

  await approvals.supersede(ctx, 'council', id);
  const tier = approvals.policyTier(ctx.inst, 'council_final', 'pre');
  const ap = await approvals.create(ctx, {
    kind: 'council_final', tier, team: 'management', title: `경영위원회 최종안: ${c.title}`,
    summary: `추천 전략 「${chosen?.name}」 — ${clip(res.final.summary || chosen?.summary, 200)}`,
    payload: { council_id: id, strategy: chosen, final: res.final, flags: flags.size, warnings: [...warnings] },
    ref_type: 'council', ref_id: id, visibility: c.visibility, requested_by: 'system',
  });
  await ctx.db.update('councils', { eq: { id } }, { status: tier === 'auto' ? 'approved' : 'awaiting_approval', updated_at: now() });
  if (tier === 'auto') await onApproved(ctx, ap, user, '');
}

const won = (v: unknown) => (v == null ? '자료 부족' : Number(v).toLocaleString('ko-KR'));
export function toMarkdown(ctx: Ctx, c: Row, res: Row, warnings: string[], chosen: Row | undefined): string {
  const L: string[] = [];
  L.push(`# 경영위원회: ${c.title}`, '', `- 공개 등급: ${acl.label(c.visibility, ctx.inst)}`, `- 시작: ${String(c.created_at).slice(0, 16).replace('T', ' ')} (UTC)`, '', '## 회사의 상태·목적·방향성', c.objective || NO_OBJECTIVE, '');
  if (c.interventions?.length) {
    L.push('## 사람의 지시');
    for (const i of c.interventions) L.push(i.kind === 'data' ? `- ${i.user_name || ''} (자료 넣기 · ${i.gap}): ${i.text}` : `- ${i.user_name || ''}: ${i.text}`);
    L.push('');
  }
  L.push('## 회의 요약', res.minutes?.summary || '', '');
  L.push('## 안건별 토론과 판정');
  for (const a of res.agenda || []) {
    const d = res.debates?.[a.id] || {};
    const dir = (res.direction?.directions || []).find((x: Row) => x.agenda_id === a.id) || {};
    L.push(`### ${a.id}. ${a.title}`, `- 비판: ${d.critic?.summary || d.critic?.error || ''}`, `- 옹호: ${d.advocate?.summary || d.advocate?.error || ''}`, `- **판정: ${dir.decision || '-'}** — ${dir.direction || ''}`, '');
  }
  L.push(`**전체 방향:** ${res.direction?.overall_direction || ''}`, '');
  L.push('## 전략 시나리오 (수정 후)');
  for (const s of res.revision?.strategies || res.proposal?.strategies || []) {
    L.push(
      `### ${s.name}${chosen && s.name === chosen.name ? ' ← 추천' : ''}`, s.summary, '',
      '| 구분 | 보수 | 기준 | 낙관 |', '|---|---|---|---|',
      `| ${s.revenue.metric}(${s.revenue.unit}) ${s.revenue.horizon} | ${won(s.revenue.conservative)} | ${won(s.revenue.base)} | ${won(s.revenue.optimistic)} |`, '',
      `- 투입 비용: ${won(s.cost.total)} ${s.cost.unit}`, `- 실적 확인일: ${s.check_date || '미정'}`, '- 핵심 가정:',
    );
    for (const a of s.assumptions) L.push(`  - ${a.text} — 틀리면: ${a.if_wrong || ''}`);
    L.push('');
  }
  L.push('## 비판자 검증', res.verification?.overall || '');
  for (const ch of res.verification?.challenges || []) L.push(`- [${ch.severity || '-'}] ${ch.strategy}: ${ch.issue}`);
  for (const cp of res.verification?.compliance || []) L.push(`- [규정·${cp.severity || '-'}] ${cp.strategy}: ${cp.issue} (${cp.basis || ''})`);
  L.push('', '## 최종안', `**추천: ${res.final?.recommended || ''}**`, '', res.final?.summary || '', '', res.final?.rationale || '');
  if (res.final?.decisions_needed?.length) {
    L.push('', '### 대표 결정이 필요한 사항');
    for (const q of res.final.decisions_needed) L.push(`- ${q.question} (선택지: ${(q.options || []).join(' / ')} · 추천: ${q.recommendation || '-'})`);
  }
  if (warnings.length) {
    L.push('', '## 주의');
    for (const w of warnings) L.push(`- ${w}`);
  }
  return L.join('\n');
}

export async function intervene(ctx: Ctx, user: AxUser, id: string, text: unknown) {
  const t = String(text || '').trim();
  if (!t) throw new AxError(400, '지시 내용을 입력하세요.');
  const c = await get(ctx, user, id);
  if (!['admin', 'lead'].includes(user.role)) throw new AxError(403, '지시는 관리자·팀장만 넣을 수 있습니다.');
  const list = [...c.interventions, { at: now(), user_id: user.id, user_name: user.name, text: t, step: c.step }];
  await ctx.db.update('councils', { eq: { id } }, { interventions: list, updated_at: now() });
  await store.audit(ctx, user, 'council.intervene', id, t);
  return { interventions: list, applies: c.status === 'running' ? '다음 단계부터 반영됩니다.' : '반영하려면 원하는 단계부터 다시 실행하세요.' };
}

const GAP_WARNING = '예측자가 밝힌 자료 부족: ';
const gapText = (x: unknown) => (typeof x === 'string' ? x : String((x as Row)?.item || (x as Row)?.text || (x as Row)?.name || '')).trim();

/** 예측자·비판자가 부족하다고 한 자료 가운데 아직 넣지 않은 것 */
export function openGaps(c: Row): string[] {
  const res: Row = c.result || {};
  const done = new Set((c.interventions || []).filter((i: Row) => i.kind === 'data').map((i: Row) => i.gap));
  const all = [...arr(res.proposal?.data_gaps), ...arr(res.revision?.data_gaps), ...arr(res.verification?.missing_data)].map(gapText).filter(Boolean);
  return [...new Set(all)].filter((g) => !done.has(g)).slice(0, 12);
}

/** 부족한 자료 넣기: 저장하고 바로 예측 단계부터 다시 계산합니다 (진행 중이면 다음 단계부터 반영). */
export async function supply(ctx: Ctx, user: AxUser, id: string, gap: unknown, text: unknown) {
  const g = String(gap || '').trim().slice(0, 200);
  const t = String(text || '').trim();
  if (!g) throw new AxError(400, '어떤 자료인지 골라 주세요.');
  if (!t) throw new AxError(400, '자료 내용을 입력하세요.');
  if (t.length > 4000) throw new AxError(400, '자료는 4000자 이내로 넣어 주세요.');
  if (!['admin', 'lead'].includes(user.role)) throw new AxError(403, '자료는 관리자·팀장만 넣을 수 있습니다.');
  const c = await get(ctx, user, id);
  if (c.status === 'approved') throw new AxError(409, '이미 승인된 위원회입니다. 새 위원회를 열어 자료를 넣어 주세요.');
  const list = [...c.interventions, { at: now(), user_id: user.id, user_name: user.name, text: t, step: c.step, kind: 'data', gap: g }];
  const rest = arr<Row>(c.interventions).filter((i) => i.kind === 'data').length + 1;
  const left = openGaps({ ...c, interventions: list }).length;
  const warnings = arr<string>(c.warnings).filter((w) => !w.startsWith(GAP_WARNING));
  await ctx.db.update('councils', { eq: { id } }, { interventions: list, warnings, updated_at: now() });
  await store.audit(ctx, user, 'council.supply', id, `${g}: ${clip(t, 200)}`);
  if (c.status === 'running') return { applies: '진행 중이라 다음 단계부터 반영됩니다.', supplied: rest };
  if (!c.result?.direction) return { applies: '판정 단계가 끝나면 반영됩니다.', supplied: rest };
  await approvals.supersede(ctx, 'council', id);
  await launch(ctx, id, 'forecast');
  return { applies: left ? `예측 단계부터 다시 계산합니다. 아직 비어 있는 자료 ${left}건.` : '예측 단계부터 다시 계산합니다.', supplied: rest };
}

export async function rerun(ctx: Ctx, user: AxUser, id: string, fromStep: string) {
  const c = await get(ctx, user, id);
  if (user.role !== 'admin') throw new AxError(403, '다시 실행은 관리자만 할 수 있습니다.');
  if (c.status === 'running') throw new AxError(409, '진행 중에는 다시 실행할 수 없습니다.');
  if (c.status === 'approved') throw new AxError(409, '이미 승인된 위원회는 다시 실행할 수 없습니다. 새 위원회를 여세요.');
  if (STEPS.findIndex((s) => s.key === fromStep) < 0) throw new AxError(400, '단계 이름이 올바르지 않습니다.');
  const need: Record<string, string> = { debate: 'agenda', direction: 'debates', forecast: 'direction', verify: 'proposal', revise: 'verification', final: 'proposal' };
  if (need[fromStep] && !c.result[need[fromStep]]) throw new AxError(400, '앞 단계 결과가 없어 이 단계부터 실행할 수 없습니다.');
  await approvals.supersede(ctx, 'council', id);
  await store.audit(ctx, user, 'council.rerun', id, fromStep);
  await launch(ctx, id, fromStep);
  return get(ctx, user, id);
}

export async function cancel(ctx: Ctx, user: AxUser, id: string) {
  const c = await get(ctx, user, id);
  if (user.role !== 'admin') throw new AxError(403, '중단은 관리자만 할 수 있습니다.');
  if (c.status !== 'running') throw new AxError(409, '진행 중인 위원회만 중단할 수 있습니다.');
  await ctx.db.update('councils', { eq: { id } }, { status: 'cancelled', updated_at: now() });
  await store.audit(ctx, user, 'council.cancel', id);
  return get(ctx, user, id);
}

// 결재 처리
async function onApproved(ctx: Ctx, ap: Row, user: AxUser, comment: string) {
  const c = await load(ctx, ap.payload.council_id);
  await ctx.db.update('councils', { eq: { id: c.id } }, { status: 'approved', updated_at: now() });
  const strategy = ap.payload.strategy;
  const fids = strategy ? await ledger.recordFromStrategy(ctx, c, strategy, c.result.revision_meta || {}) : [];
  // 승인되면 팀별 작업지시로 쪼갠다
  ctx.spawn({ type: 'plan', councilId: c.id, userId: user.id, comment });
  return { forecasts: fids.length, planning: true };
}

/** 백그라운드 일: 승인된 최종안을 작업지시로 */
export async function runPlan(ctx: Ctx, councilId: string, user: AxUser, comment: string) {
  const c = await load(ctx, councilId);
  const ap = (await ctx.db.find('approvals', { eq: { ref_type: 'council', ref_id: councilId }, in: { status: ['approved', 'done'] } }, { order: [['created_at', 'desc']], limit: 1 }))[0];
  await planFromCouncil(ctx, c, ap?.payload?.strategy ?? {}, user, comment);
}

approvals.registerHandler('council_final', async (ctx, ap, user, action, comment) => {
  const id = ap.payload.council_id;
  if (action === 'approve') return onApproved(ctx, ap, user, comment);
  if (action === 'reject') {
    await ctx.db.update('councils', { eq: { id } }, { status: 'rejected', updated_at: now() });
    return { rejected: true };
  }
  // 수정 요구: 지시로 기록하고 전략 수립 단계부터 다시
  const c = await load(ctx, id);
  await ctx.db.update('councils', { eq: { id } }, { interventions: [...c.interventions, { at: now(), user_id: user.id, user_name: user.name, text: comment, step: 'final' }] });
  await launch(ctx, id, 'forecast');
  return { rerun_from: 'forecast' };
});
