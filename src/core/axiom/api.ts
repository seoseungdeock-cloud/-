// AXIOM 요청 처리 — AXIOM v0.1 server.js 의 주소(route)들을 그대로 옮긴 것.
// 앱은 서버가 있으면 서버 함수(supabase/functions/axiom)로, 없으면 기기 안에서 이 함수를 바로 부릅니다.
import * as acl from './acl';
import * as approvals from './approvals';
import * as council from './council';
import * as ledger from './ledger';
import * as llm from './llm';
import * as registry from './registry';
import * as runner from './runner';
import * as scheduler from './scheduler';
import * as store from './store';
import type { AxUser, Ctx, Job } from './types';
import { AxError } from './util';
import * as workorders from './workorders';

type Args = Record<string, any>;

function needAdmin(user: AxUser) {
  if (user.role !== 'admin') throw new AxError(403, '관리자어드민만 할 수 있습니다.');
}

export function instanceInfo(ctx: Ctx) {
  const i = ctx.inst;
  return {
    key: i.key, name: i.name, brand: i.brand, teams: i.teams, kinds: store.KINDS, manual_fields: registry.MANUAL_FIELDS, steps: council.STEPS,
    state_template: i.council?.state_template || '', default_visibility: i.council?.default_visibility || 'org', tiers: approvals.TIERS,
  };
}

async function status(ctx: Ctx, user: AxUser) {
  const av = llm.available(ctx.env);
  const providers = (['anthropic', 'openai', 'gemini'] as const).map((p) => ({ key: p, label: llm.LABEL[p], connected: av[p] }));
  const pending = (await approvals.list(ctx, user, { status: 'pending' })).length;
  const running = (await ctx.db.find('councils', { ...acl.filter(user), eq: { status: 'running' } }, { cols: ['id', 'title', 'step'] })).map((c) => ({
    ...c,
    step_label: council.STEPS.find((s) => s.key === c.step)?.label || '',
  }));
  return { mock_mode: !providers.some((p) => p.connected), providers, pending, running, month_usd: await runner.monthSpend(ctx), budget_usd: ctx.inst.budget?.monthly_usd ?? null };
}

/** 사람이 부르는 기능. op 이름은 AXIOM 주소를 줄인 것 (예: GET /api/councils/:id → councils.get) */
export async function handle(ctx: Ctx, user: AxUser, op: string, a: Args = {}): Promise<unknown> {
  switch (op) {
    case 'instance':
      return instanceInfo(ctx);
    case 'status':
      return status(ctx, user);

    case 'docs.list':
      return store.listDocs(ctx, user, a);
    case 'docs.create': {
      const vis = acl.normalize(a.visibility || ctx.inst.default_visibility || 'org', ctx.inst);
      if (!acl.canSee(user, vis)) throw new AxError(403, '내가 볼 수 없는 공개 등급으로는 저장할 수 없습니다.');
      return store.createDoc(ctx, user, { kind: a.kind, title: a.title, body: a.body, visibility: vis, tags: Array.isArray(a.tags) ? a.tags : [] });
    }
    case 'docs.get':
      return store.getDoc(ctx, user, a.id);
    case 'docs.update':
      return store.updateDoc(ctx, user, a.id, { title: a.title, body: a.body, visibility: a.visibility, tags: a.tags });
    case 'docs.revisions':
      return store.revisions(ctx, user, a.id);
    case 'docs.revision':
      return store.revision(ctx, user, a.id, a.rev);

    case 'agents.list':
      return registry.listAgents(ctx, { includeArchived: !!a.archived });
    case 'agents.create':
      return registry.createAgent(ctx, user, a);
    case 'agents.get':
      return registry.getAgent(ctx, a.slug, a.version ? Number(a.version) : null);
    case 'agents.update':
      return registry.updateAgent(ctx, user, a.slug, a);
    case 'agents.archive':
      await registry.setArchived(ctx, user, a.slug, a.archived !== false);
      return { ok: true };
    case 'agents.versions':
      return registry.versions(ctx, a.slug);
    case 'agents.chat':
      return runner.chat(ctx, user, a.slug, { conversation_id: a.conversation_id, message: a.message, visibility: a.visibility });
    case 'agents.export':
      needAdmin(user);
      return registry.exportEngineAgents(ctx);

    case 'conversations.list':
      return runner.listConversations(ctx, user, a);
    case 'conversations.get':
      return runner.getConversation(ctx, user, a.id);
    case 'runs.list':
      return runner.listRuns(ctx, user, a);
    case 'runs.get':
      return runner.getRun(ctx, user, a.id);

    case 'councils.list':
      return council.list(ctx, user);
    case 'councils.start':
      return council.start(ctx, user, a);
    case 'councils.parseState':
      return council.parseState(a.text);
    case 'councils.get':
      return council.get(ctx, user, a.id);
    case 'councils.intervene':
      return council.intervene(ctx, user, a.id, a.text);
    case 'councils.link':
      return council.link(ctx, user, a.id, a.room_id);
    case 'councils.forRoom':
      return council.forRoom(ctx, user, a.room_id);
    case 'councils.addMeeting':
      return council.addMeeting(ctx, user, a.id, a);
    case 'councils.supply':
      return council.supply(ctx, user, a.id, a.gap, a.text);
    case 'councils.rerun':
      return council.rerun(ctx, user, a.id, a.from_step);
    case 'councils.cancel':
      return council.cancel(ctx, user, a.id);

    case 'approvals.list':
      return approvals.list(ctx, user, { status: a.status || 'pending' });
    case 'approvals.get':
      return approvals.get(ctx, user, a.id);
    case 'approvals.decide':
      return approvals.decide(ctx, user, a.id, a);

    case 'work.list':
      return workorders.list(ctx, user, a);
    case 'work.create':
      if (user.role !== 'admin' && !user.teams.includes(a.team)) throw new AxError(403, '다른 팀 작업지시는 관리자가 내리거나 해당 팀 팀장에게 요청하세요.');
      return workorders.createAndDispatch(ctx, user, { team: a.team, title: a.title, detail: a.detail, deliverable: a.deliverable });
    case 'work.get': {
      const w = await workorders.get(ctx, user, a.id);
      const runs = await runner.listRuns(ctx, user, { work_order_id: a.id, limit: 20 });
      return { ...w, runs };
    }
    case 'work.run':
      return workorders.runNow(ctx, user, a.id, { instruction: a.instruction });

    case 'ledger.get':
      return { summary: await ledger.summary(ctx, user), forecasts: await ledger.list(ctx, user, a) };
    case 'ledger.actual':
      return ledger.recordActual(ctx, user, a.id, a);

    case 'schedules.list':
      return scheduler.list(ctx);
    case 'schedules.create':
      return scheduler.create(ctx, user, a);
    case 'schedules.toggle':
      await scheduler.toggle(ctx, user, a.id, !!a.enabled);
      return { ok: true };
    case 'schedules.run': {
      needAdmin(user);
      const s = await ctx.db.one('schedules', { eq: { id: a.id } });
      if (!s) throw new AxError(404, '보고 일정을 찾을 수 없습니다.');
      return scheduler.runReport(ctx, s, { force: true });
    }

    case 'audit.list': {
      needAdmin(user);
      const rows = await ctx.db.find('audit', {}, { order: [['at', 'desc']], limit: 300 });
      return store.withNames(ctx, rows, 'user_id', 'user_name');
    }
    default:
      throw new AxError(404, '알 수 없는 요청입니다.');
  }
}

/** 백그라운드 일 실행 (council 한 단계, 작업지시 분해·수행, 정기 보고) */
export async function runJob(ctx: Ctx, job: Job): Promise<void> {
  if (job.type === 'council') return council.runStep(ctx, job.councilId, job.step, job.token);
  if (job.type === 'report') {
    const s = await ctx.db.one('schedules', { eq: { id: job.scheduleId } });
    if (s) await scheduler.runReport(ctx, s, { force: job.force });
    return;
  }
  const user = await ctx.userById(job.userId);
  if (!user) return;
  if (job.type === 'plan') return council.runPlan(ctx, job.councilId, user, job.comment);
  if (job.type === 'work') {
    try {
      await workorders.execute(ctx, user, job.workOrderId, job.feedback);
    } catch {
      // 실패는 작업지시 상태(실패)와 실행 기록에 남습니다
    }
  }
}

export { scheduler };
