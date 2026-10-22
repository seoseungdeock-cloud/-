import { handle, runJob } from '../axiom/api';
import { parseState } from '../axiom/council';
import { MemoryDb } from '../axiom/db';
import { scan } from '../axiom/guardrails';
import { INSTANCE } from '../axiom/instance';
import { pickGpt, resolve } from '../axiom/llm';
import { runAgent } from '../axiom/runner';
import { describe as describeSpec, lastDue, parseSpec, runReport, tick } from '../axiom/scheduler';
import type { AxUser, Ctx, Env, Job } from '../axiom/types';
import { koNum } from '../axiom/util';

const CEO: AxUser = { id: 'u_ceo', name: '대표', role: 'admin', teams: INSTANCE.teams.map((t) => t.key) };
const LEAD: AxUser = { id: 'u_lead', name: '마케팅팀장', role: 'lead', teams: ['marketing'] };
const PEOPLE = [CEO, LEAD];

function makeCtx(env: Env = {}, fetchImpl?: typeof fetch) {
  const jobs: Job[] = [];
  const ctx: Ctx = {
    db: new MemoryDb(),
    inst: INSTANCE,
    env,
    async names(ids) {
      return Object.fromEntries(PEOPLE.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.name]));
    },
    async userById(id) {
      return PEOPLE.find((p) => p.id === id) ?? null;
    },
    async owner() {
      return CEO;
    },
    spawn: (j) => void jobs.push(j),
    fetch: fetchImpl,
  };
  const drain = async () => {
    for (let i = 0; jobs.length && i < 100; i++) await runJob(ctx, jobs.shift()!);
  };
  const call = (u: AxUser, op: string, a: Record<string, unknown> = {}) => handle(ctx, u, op, a) as Promise<any>;
  return { ctx, jobs, drain, call };
}

const MEETING = `2026년 4분기 경영회의\n1. 형사 분야 검색광고 확대 여부\n2. 블로그 발행량을 하루 10건으로 늘리는 안\n3. 신규 변호사 채용 시기`;
const STATE = '항목,값,단위\n월 매출,1000000000,원\n월 마케팅 비용,50000000,원';

describe('AXIOM 엔진 (라잇나우판)', () => {
  test('회사 상태 시트와 한국식 금액을 읽는다', () => {
    expect(koNum('13억')).toBe(1300000000);
    expect(koNum('3,500만원')).toBe(35000000);
    const s = parseState('항목,값,단위\n월 매출,1,200,000,000,원\n상담 건수: 120 건\n메모 한 줄');
    expect(s.metrics[0]).toEqual({ name: '월 매출', value: 1200000000, unit: '원' });
    expect(s.metrics[1]).toEqual({ name: '상담 건수', value: 120, unit: '건' });
    expect(s.notes).toBe('메모 한 줄');
  });

  test('경영위원회 7단계 → 대표 결재 → 예측 원장 · 작업지시 → 결과 확인', async () => {
    const { call, drain, ctx } = makeCtx();
    const c = await call(CEO, 'councils.start', { title: '4분기 전략', meeting_text: MEETING, state_text: STATE, objective: '형사 분야 매출을 3개월 안에 10% 늘린다' });
    expect(c.status).toBe('running');
    await drain();
    const done = await call(CEO, 'councils.get', { id: c.id });
    expect(done.status).toBe('awaiting_approval');
    expect(done.result.agenda).toHaveLength(3);
    expect(Object.keys(done.result.debates)).toHaveLength(3);
    expect(done.result.revision.strategies).toHaveLength(3);
    expect(done.result.final.recommended).toBe('전문분야 집중형');
    expect(done.runs.length).toBe(1 + 6 + 1 + 1 + 1 + 1 + 1);
    expect(done.warnings.join(' ')).toContain('모의 응답');
    const record = await call(CEO, 'docs.get', { id: done.record_doc_id });
    expect(record.kind).toBe('council');
    expect(record.body).toContain('## 최종안');

    const inbox = await call(CEO, 'approvals.list');
    const ap = inbox.find((a: any) => a.kind === 'council_final');
    expect(ap.tier).toBe('pre');
    expect(ap.can_decide).toBe(true);
    // 팀장은 사전 승인을 처리할 수 없다
    await expect(call(LEAD, 'approvals.decide', { id: ap.id, action: 'approve' })).rejects.toThrow();

    await call(CEO, 'approvals.decide', { id: ap.id, action: 'approve', comment: '진행' });
    await drain();
    const ledger = await call(CEO, 'ledger.get');
    expect(ledger.forecasts.map((f: any) => f.metric).sort()).toEqual(['월 매출', '투입 비용']);
    const works = await call(CEO, 'work.list', { council_id: c.id });
    expect(works.length).toBeGreaterThan(3);
    // 인사팀 일은 기밀 + 사전 승인
    const hr = works.find((w: any) => w.team === 'hr');
    expect(hr.visibility).toBe('confidential');
    expect(hr.status).toBe('awaiting_approval');
    const mk = works.find((w: any) => w.team === 'marketing');
    expect(mk.status).toBe('review');
    expect(mk.deliverable_doc_id).toBeTruthy();
    // 팀장은 기밀(인사) 작업을 볼 수 없다
    const leadWorks = await call(LEAD, 'work.list', { council_id: c.id });
    expect(leadWorks.some((w: any) => w.team === 'hr')).toBe(false);

    // 결과 확인: 수정 요구 → 다시 수행 → 승인
    const res = (await call(CEO, 'approvals.list')).find((a: any) => a.kind === 'work_order_result' && a.payload.work_order_id === mk.id);
    expect(res.tier).toBe('post');
    expect((await call(LEAD, 'approvals.list')).some((a: any) => a.id === res.id && a.can_decide)).toBe(true);
    await call(LEAD, 'approvals.decide', { id: res.id, action: 'revise', comment: '키워드 목록을 표로' });
    await drain();
    const again = await call(CEO, 'work.get', { id: mk.id });
    expect(again.status).toBe('review');
    const doc = await call(CEO, 'docs.get', { id: again.deliverable_doc_id });
    expect(doc.rev).toBe(2);
    expect(doc.body).toContain('키워드 목록을 표로');
    const res2 = (await call(CEO, 'approvals.list')).find((a: any) => a.kind === 'work_order_result' && a.payload.work_order_id === mk.id);
    await call(CEO, 'approvals.decide', { id: res2.id, action: 'approve' });
    expect((await call(CEO, 'work.get', { id: mk.id })).status).toBe('done');

    // 실적 입력 → 적중률
    const rev = ledger.forecasts.find((f: any) => f.metric === '월 매출');
    const r = await call(CEO, 'ledger.actual', { id: rev.id, actual: '10억 5천만' });
    expect(r.actual).toBe(1050000000);
    expect(r.in_range).toBe(true);
    expect((await call(CEO, 'ledger.get')).summary.measured).toBe(1);
    expect((await ctx.db.find('audit', { eq: { action: 'ledger.actual' } })).length).toBe(1);
  });

  test('수정 요구는 지시로 남고 전략 수립부터 다시 돈다 · 중단과 다시 실행', async () => {
    const { call, drain, jobs } = makeCtx();
    const c = await call(CEO, 'councils.start', { title: '채널 전략', meeting_text: MEETING, objective: '상담 유입 채널을 넓힌다 (3개월)' });
    await drain();
    const ap = (await call(CEO, 'approvals.list')).find((a: any) => a.kind === 'council_final');
    const r = await call(CEO, 'approvals.decide', { id: ap.id, action: 'revise', comment: '비용을 절반으로' });
    expect(r.result.rerun_from).toBe('forecast');
    expect(jobs[0]).toMatchObject({ type: 'council', step: 'forecast' });
    await drain();
    const c2 = await call(CEO, 'councils.get', { id: c.id });
    expect(c2.status).toBe('awaiting_approval');
    expect(c2.interventions.map((i: any) => i.text)).toEqual(['비용을 절반으로']);
    expect((await call(CEO, 'approvals.list')).filter((a: any) => a.kind === 'council_final')).toHaveLength(1);

    // 진행 중 중단 → 남은 단계는 돌지 않음 → 다시 실행
    const d = await call(CEO, 'councils.start', { title: '중단 시험', meeting_text: MEETING, objective: '중단되는지 확인합니다 (시험)' });
    await call(CEO, 'councils.cancel', { id: d.id });
    await drain();
    expect((await call(CEO, 'councils.get', { id: d.id })).status).toBe('cancelled');
    await expect(call({ ...LEAD, teams: ['management'] }, 'councils.rerun', { id: d.id, from_step: 'agenda' })).rejects.toThrow('관리자');
    await call(CEO, 'councils.rerun', { id: d.id, from_step: 'agenda' });
    await drain();
    expect((await call(CEO, 'councils.get', { id: d.id })).status).toBe('awaiting_approval');
  });

  test('목적 없이 열 수 있고, 부족한 자료를 넣으면 예측부터 다시 계산한다', async () => {
    const { call, drain, jobs, ctx } = makeCtx();
    const c = await call(CEO, 'councils.start', { title: '자료 보충', meeting_text: MEETING });
    await drain();
    const c1 = await call(CEO, 'councils.get', { id: c.id });
    expect(c1.status).toBe('awaiting_approval');
    expect(c1.record_md).toContain('회의록 내용으로 판단');
    const gaps: string[] = c1.data_gaps;
    expect(gaps.length).toBeGreaterThan(0);
    await expect(call(CEO, 'councils.supply', { id: c.id, gap: gaps[0], text: '' })).rejects.toThrow('자료 내용');
    const r = await call(CEO, 'councils.supply', { id: c.id, gap: gaps[0], text: '9월 매출 12억' });
    expect(r.applies).toContain('예측 단계부터');
    expect(jobs[0]).toMatchObject({ type: 'council', step: 'forecast' });
    await drain();
    const c2 = await call(CEO, 'councils.get', { id: c.id });
    expect(c2.status).toBe('awaiting_approval');
    expect(c2.data_gaps).not.toContain(gaps[0]);
    expect(c2.warnings.some((w: string) => w.startsWith('예측자가 밝힌 자료 부족') && w.includes(gaps[0]))).toBe(false);
    expect(c2.record_md).toContain(`자료 넣기 · ${gaps[0]}`);
    const run = (await ctx.db.find('runs', {})).filter((x: any) => x.mode === 'propose').pop();
    expect(JSON.stringify(run?.input ?? '')).toContain('9월 매출 12억');
  });

  test('공개 등급: 팀장은 다른 팀·기밀 문서를 못 본다', async () => {
    const { call } = makeCtx();
    const conf = await call(CEO, 'docs.create', { kind: 'note', title: '인사 메모', body: '평가', visibility: 'confidential' });
    const hr = await call(CEO, 'docs.create', { kind: 'note', title: '인사팀 메모', body: '팀', visibility: 'team:hr' });
    await call(CEO, 'docs.create', { kind: 'manual', title: '전사 매뉴얼', body: '누구나 보는 형사 절차', visibility: 'org' });
    const seen = (await call(LEAD, 'docs.list')).map((d: any) => d.title);
    expect(seen).toEqual(['전사 매뉴얼']);
    await expect(call(LEAD, 'docs.get', { id: conf.id })).rejects.toThrow('열람 권한');
    await expect(call(LEAD, 'docs.get', { id: hr.id })).rejects.toThrow('열람 권한');
    await expect(call(LEAD, 'docs.create', { kind: 'note', title: 'x', visibility: 'confidential' })).rejects.toThrow();
    // 검색과 개정 이력
    expect((await call(CEO, 'docs.list', { q: '형사 절차' })).map((d: any) => d.title)).toEqual(['전사 매뉴얼']);
    const doc = (await call(CEO, 'docs.list', { kind: 'manual' }))[0];
    await call(LEAD, 'docs.update', { id: doc.id, body: '고친 본문' });
    expect((await call(CEO, 'docs.revisions', { id: doc.id })).map((r: any) => [r.rev, r.editor])).toEqual([[2, '마케팅팀장'], [1, '대표']]);
    expect((await call(CEO, 'docs.revision', { id: doc.id, rev: 1 })).body).toBe('누구나 보는 형사 절차');
  });

  test('에이전트 레지스트리: 기본 12종, 매뉴얼 필수, 고치면 새 버전 · 대화는 저장소에 기록', async () => {
    const { call } = makeCtx();
    const list = await call(CEO, 'agents.list');
    expect(list).toHaveLength(12);
    await expect(call(CEO, 'agents.create', { slug: 'tax', name: '세무', prompt: '짧음', manual: {} })).rejects.toThrow('매뉴얼');
    const manual = { purpose: '세무 일정과 신고 준비를 돕습니다', how_to_use: '대화에서 신고 종류와 기한을 알려 주면 준비물을 정리해 드립니다. 자료를 붙여 넣으세요.', inputs: '신고 종류', outputs: '준비물 목록', cautions: '최종 확인은 세무사', example: '부가세 신고 준비물 알려줘' };
    const a = await call(LEAD, 'agents.create', { slug: 'tax', name: '세무 도우미', team: 'management', prompt: '당신은 법인의 세무 일정을 챙기는 도우미입니다. 기한과 준비물을 정확히 알려 줍니다.', manual });
    expect(a.origin).toBe('instance');
    await expect(call(LEAD, 'agents.update', { slug: 'critic', prompt: 'x'.repeat(40), change_note: '시험' })).rejects.toThrow('관리자');
    const v2 = await call(LEAD, 'agents.update', { slug: 'tax', name: '세무 비서', change_note: '이름 변경' });
    expect(v2.current_version).toBe(2);
    expect((await call(CEO, 'agents.versions', { slug: 'tax' })).map((v: any) => v.version)).toEqual([2, 1]);

    const r = await call(LEAD, 'agents.chat', { slug: 'critic', message: '블로그 하루 10건 계획 검토해줘', visibility: 'team:marketing' });
    expect(r.reply).toContain('[모의 응답]');
    const r2 = await call(LEAD, 'agents.chat', { slug: 'critic', message: '하나 더', conversation_id: r.conversation.id });
    expect(r2.conversation.id).toBe(r.conversation.id);
    const conv = await call(LEAD, 'conversations.get', { id: r.conversation.id });
    expect(conv.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const doc = await call(LEAD, 'docs.get', { id: conv.doc_id });
    expect(doc.kind).toBe('conversation');
    expect(doc.body).toContain('### 마케팅팀장');
    await expect(call(LEAD, 'docs.update', { id: doc.id, body: '조작' })).rejects.toThrow('원본');
    expect((await call(CEO, 'agents.list')).find((x: any) => x.slug === 'critic').run_count).toBe(2);
  });

  test('규정 점검: 주민번호는 가리고, 변호사법 표현은 표시만', () => {
    const f = scan(INSTANCE, '의뢰인 900101-1234567 연락, 사건 소개료 지급, 승소율 98%');
    expect(f.map((x) => x.id).sort()).toEqual(['ad-superlative', 'law-34-referral', 'pii-rrn']);
    expect(f.find((x) => x.id === 'pii-rrn')!.excerpt).not.toContain('1234567');
  });

  test('모델 라우팅: 키가 없으면 모의 응답, 선호 제공자가 없으면 대체 + 경고', () => {
    expect(resolve(INSTANCE, {}, 'tier:best', 'anthropic')).toMatchObject({ provider: 'mock' });
    expect(resolve(INSTANCE, { ANTHROPIC_API_KEY: 'k' }, 'tier:best', 'anthropic')).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5', note: null });
    const critic = resolve(INSTANCE, { ANTHROPIC_API_KEY: 'k' }, 'tier:balanced', 'openai');
    expect(critic.provider).toBe('anthropic');
    expect(critic.note).toContain('OpenAI');
    expect(resolve(INSTANCE, { ANTHROPIC_API_KEY: 'k', AXIOM_LLM: 'mock' }, 'tier:best')).toMatchObject({ provider: 'mock' });
  });

  test('GPT 키만 있으면 GPT로, 모델은 키로 쓸 수 있는 최신 GPT를 고름', () => {
    expect(resolve(INSTANCE, { OPENAI_API_KEY: 'k' }, 'tier:balanced')).toEqual({ provider: 'openai', model: 'auto:balanced', note: null });
    const ids = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.1', 'gpt-5.1-mini', 'gpt-4o-realtime-preview', 'gpt-5-2025-08-07', 'gpt-image-1', 'gpt-3.5-turbo'];
    expect(pickGpt(ids, 'balanced')).toBe('gpt-5.1');
    expect(pickGpt(ids, 'best')).toBe('gpt-5.1');
    expect(pickGpt(ids, 'economy')).toBe('gpt-5.1-mini');
    expect(pickGpt([], 'balanced')).toBe('gpt-4o-mini');
  });

  test('실제 AI 호출 형식 (가짜 서버) + JSON 보정 1회', async () => {
    const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
    let n = 0;
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      n++;
      const text = n === 2 ? '설명만 있고 JSON이 없음' : '{"stance":"비판","summary":"근거 부족","points":[],"risks":[],"questions":[]}';
      return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 }, model: 'claude-sonnet-5-5' }), { status: 200 });
    }) as unknown as typeof fetch;
    const { call, ctx } = makeCtx({ ANTHROPIC_API_KEY: 'test-key' }, fake);
    const r = await call(CEO, 'agents.chat', { slug: 'advocate', message: '안녕하세요' });
    expect(r.provider).toBe('anthropic');
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].headers['x-api-key']).toBe('test-key');
    expect(calls[0].body.system).toContain('대원칙');
    // JSON 모드: 첫 응답이 형식에 안 맞으면 한 번 다시 요청
    const out = await runAgent(ctx, { slug: 'critic', mode: 'debate', input: { agenda_item: { title: 't' } }, user: CEO });
    expect(out.output.summary).toBe('근거 부족');
    expect(calls).toHaveLength(3);
    const run = await call(CEO, 'runs.get', { id: out.run_id });
    expect([run.tokens_in, run.tokens_out]).toEqual([20, 10]);
  });

  test('정기 보고: 주기 해석, 활동 없으면 건너뜀, 있으면 보고서 + 결재', async () => {
    expect(parseSpec('weekly 월 09:00')).toEqual({ kind: 'weekly', dow: 1, h: 9, min: 0 });
    expect(describeSpec('weekdays 18:00')).toBe('평일 18:00');
    expect(lastDue('daily 18:00', new Date('2026-10-21T10:00:00Z'))!.toISOString()).toBe('2026-10-21T09:00:00.000Z');
    const { call, drain, jobs, ctx } = makeCtx();
    await expect(call(LEAD, 'schedules.create', { name: '주간', spec: 'weekly 월 09:00' })).rejects.toThrow('관리자');
    await expect(call(CEO, 'schedules.create', { name: '주간', spec: '매주' })).rejects.toThrow('주기 형식');
    const s = await call(CEO, 'schedules.create', { name: '일일 보고', spec: 'daily 18:00' });
    expect((await call(CEO, 'schedules.run', { id: s.id })).doc_id).toBeTruthy();
    const s2 = await call(CEO, 'schedules.create', { name: '빈 보고', spec: 'daily 18:00' });
    expect(await runReport(ctx, s2)).toEqual({ skipped: true, reason: '보고할 활동 없음' });
    await call(CEO, 'work.create', { team: 'marketing', title: '키워드 정리', detail: '형사' });
    await drain();
    await ctx.db.update('schedules', { eq: { id: s.id } }, { last_run_at: '2026-01-01T00:00:00.000Z' });
    expect(await tick(ctx)).toBe(1);
    expect(jobs[0]).toMatchObject({ type: 'report', scheduleId: s.id });
    await drain();
    expect((await call(CEO, 'docs.list', { kind: 'report' })).length).toBeGreaterThanOrEqual(2);
    expect((await call(CEO, 'approvals.list')).some((a: any) => a.kind === 'report')).toBe(true);
  });
});
