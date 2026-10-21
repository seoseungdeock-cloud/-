// AXIOM 서버 함수 — 업무 탭의 경영위원회·결재함·저장소·에이전트·작업지시·예측 원장.
// 엔진은 앱과 같은 코드(src/core/axiom)이고, 올릴 때 한 파일로 묶습니다: bash scripts/deploy-axiom.sh
//
// 부르는 쪽 세 가지:
//   1) 앱(어드민 계정): { op, args } — 로그인 토큰으로 계정을 확인하고 AXIOM 권한으로 바꿔 처리
//   2) 이 함수 자신: { job } — 오래 걸리는 일(위원회 한 단계, 작업지시 수행)을 새 실행 시간으로 넘김
//   3) 예약 작업(5분마다): { tick: true } — 예정 시각이 지난 정기 보고
//   4) 대화방 @AI(모든 계정): { op: 'room.ask', args: { roomId, text } } — AI 참여방 참여자만, 사건 수행 질문만
// 2·3 은 x-axiom-job 머리글에 푸시 함수와 같은 비밀값(PUSH_CRON_SECRET)이 있어야 합니다.
// AI 키(ANTHROPIC_API_KEY · OPENAI_API_KEY · GEMINI_API_KEY)는 Supabase 함수 비밀값에만 둡니다. 없으면 모의 응답.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { handle, runJob, scheduler } from '../../../src/core/axiom/api';
import type { Db, FindOpts, Row, Table, Where } from '../../../src/core/axiom/db';
import { INSTANCE } from '../../../src/core/axiom/instance';
import { complete, resolve } from '../../../src/core/axiom/llm';
import { finishRoomAi, levelOf, roomAiInput, roomAiSystem, selfRoomLike } from '../../../src/core/room-ai';
import type { AxUser, Ctx, Job } from '../../../src/core/axiom/types';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const clean = (w: string) => w.replace(/[,()*%\\"]/g, ' ').trim();

class PgDb implements Db {
  constructor(private sb: SupabaseClient) {}
  private q(table: Table) {
    return `ax_${table}`;
  }
  // deno-lint-ignore no-explicit-any
  private where(q: any, w: Where) {
    for (const [k, v] of Object.entries(w.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
    for (const [k, v] of Object.entries(w.neq ?? {})) q = q.neq(k, v);
    for (const [k, vs] of Object.entries(w.in ?? {})) q = q.in(k, vs);
    for (const [k, v] of Object.entries(w.gt ?? {})) q = q.gt(k, v);
    for (const [k, v] of Object.entries(w.gte ?? {})) q = q.gte(k, v);
    for (const [k, v] of Object.entries(w.lte ?? {})) q = q.lte(k, v);
    for (const word of w.search?.words ?? []) {
      const s = clean(word);
      if (s) q = q.or(w.search!.cols.map((c) => `${c}.ilike.*${s}*`).join(','));
    }
    return q;
  }
  async one(table: Table, w: Where) {
    const { data, error } = await this.where(this.sb.from(this.q(table)).select('*'), w).limit(1);
    if (error) throw new Error(error.message);
    return (data?.[0] as Row) ?? null;
  }
  async find(table: Table, w: Where, o: FindOpts = {}) {
    let q = this.where(this.sb.from(this.q(table)).select(o.cols?.join(',') ?? '*'), w);
    for (const [col, dir] of o.order ?? []) q = q.order(col, { ascending: dir === 'asc', nullsFirst: dir === 'asc' });
    const off = o.offset ?? 0;
    q = q.range(off, off + (o.limit ?? 1000) - 1);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  }
  async insert(table: Table, row: Row) {
    const { error } = await this.sb.from(this.q(table)).insert(row);
    if (error) throw new Error(error.message);
  }
  async update(table: Table, w: Where, patch: Row) {
    const { error, count } = await this.where(this.sb.from(this.q(table)).update(patch, { count: 'exact' }), w);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
}

type Profile = { id: string; nickname: string; role: string; super_admin: boolean; active: boolean };
const toAx = (p: Profile | null): AxUser | null =>
  p && p.active && p.role === 'admin' ? { id: p.id, name: p.nickname, role: p.super_admin ? 'admin' : 'lead', teams: INSTANCE.teams.map((t) => t.key) } : null;

function makeCtx(sb: SupabaseClient, url: string, secret: string): Ctx {
  const profile = async (id: string) => {
    const { data } = await sb.from('profiles').select('id, nickname, role, super_admin, active').eq('id', id).maybeSingle();
    return (data as Profile) ?? null;
  };
  return {
    db: new PgDb(sb),
    inst: INSTANCE,
    env: {
      ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY'),
      OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY'),
      GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
      AXIOM_LLM: Deno.env.get('AXIOM_LLM'),
      AXIOM_LLM_TIMEOUT_MS: Deno.env.get('AXIOM_LLM_TIMEOUT_MS'),
    },
    async names(ids) {
      const uuids = ids.filter((i) => /^[0-9a-f-]{36}$/.test(i));
      if (!uuids.length) return {};
      const { data } = await sb.from('profiles').select('id, nickname').in('id', uuids);
      return Object.fromEntries((data ?? []).map((p: { id: string; nickname: string }) => [p.id, p.nickname]));
    },
    async userById(id) {
      return /^[0-9a-f-]{36}$/.test(id) ? toAx(await profile(id)) : null;
    },
    async owner() {
      const { data } = await sb.from('profiles').select('id, nickname, role, super_admin, active').eq('role', 'admin').eq('super_admin', true).eq('active', true).order('created_at').limit(1);
      return toAx((data?.[0] as Profile) ?? null);
    },
    spawn(job: Job) {
      // 새 실행으로 넘기기: 받는 쪽은 바로 202 로 답하고 자기 실행 시간 안에서 일을 합니다
      EdgeRuntime.waitUntil(
        fetch(`${url}/functions/v1/axiom`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-axiom-job': secret }, body: JSON.stringify({ job }) })
          .then((r) => r.body?.cancel())
          .catch((e) => console.error('[axiom spawn]', job.type, (e as Error).message)),
      );
    },
  };
}

/** 대화방 @AI: 방 참여자인지, AI 참여방인지 서버에서 다시 확인하고 최근 대화(실명 대신 역할)로 답합니다 */
async function roomAsk(sb: SupabaseClient, ctx: Ctx, uid: string, args: Record<string, unknown>) {
  const roomId = String(args.roomId ?? '');
  const text = String(args.text ?? '').slice(0, 4000);
  if (!/^[0-9a-f-]{36}$/.test(roomId) || !text.trim()) throw Object.assign(new Error('bad request'), { status: 400 });
  const [{ data: room }, { data: members }] = await Promise.all([
    sb.from('rooms').select('id, kind, mode, title').eq('id', roomId).maybeSingle(),
    sb.from('room_members').select('user_id, profiles(role, active)').eq('room_id', roomId),
  ]);
  const list = (members ?? []) as unknown as { user_id: string; profiles: { role: string; active: boolean } | null }[];
  const me = list.find((m) => m.user_id === uid);
  if (!room || !me?.profiles?.active) return { reply: null, reason: '참여 중인 방이 아닙니다.' };
  const self = selfRoomLike(room.kind, list.length, room.title) ? { firm: me.profiles.role !== 'client' } : undefined;
  const level = levelOf(room.mode, room.kind, list.some((m) => m.profiles?.role === 'lawyer'), self);
  if (level === 'none') return { reply: null, reason: '이 방은 AI가 참여하지 않는 방입니다.' };
  const pick = resolve(INSTANCE, ctx.env, 'tier:balanced');
  if (pick.provider === 'mock') return { reply: null, reason: 'AI 키가 아직 연결되지 않았습니다.' };
  const { data: rows } = await sb.from('messages').select('sender_id, sender_kind, text, kind, recalled').eq('room_id', roomId).order('created_at', { ascending: false }).limit(20);
  const recent = ((rows ?? []) as { sender_id: string | null; sender_kind: string; text: string; kind: string; recalled: boolean }[])
    .filter((m) => !m.recalled && (m.kind === 'text' || m.kind === 'ai'))
    .reverse()
    .map((m) => ({ senderId: m.sender_id, senderKind: m.sender_kind, text: m.text }));
  // 방금 보낸 질문이 이미 저장됐으면 기록에서 빼고 '요청'으로만 넣습니다
  if (recent.length && recent[recent.length - 1].senderId === uid && recent[recent.length - 1].text.trim() === text.trim()) recent.pop();
  const roleOf = Object.fromEntries(list.map((m) => [m.user_id, m.profiles?.role ?? '']));
  const out = await complete(ctx, pick.provider, {
    model: pick.model,
    system: roomAiSystem(level),
    messages: [{ role: 'user', content: roomAiInput(recent, roleOf, text) }],
    maxTokens: 1500,
    meta: { mode: 'room', agentName: 'AI' },
  });
  return { ...finishRoomAi(out.text), level, model: out.model };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const secret = Deno.env.get('PUSH_CRON_SECRET') ?? '';
  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const ctx = makeCtx(sb, url, secret);

  let body: { op?: string; args?: Record<string, unknown>; job?: Job; tick?: boolean };
  try {
    body = await req.json();
  } catch {
    return reply(400, { ok: false, reason: '알 수 없는 요청입니다.' });
  }

  // 2·3) 이 함수 자신 또는 예약 작업
  if (body.job || body.tick) {
    if (!secret || req.headers.get('x-axiom-job') !== secret) return reply(403, { ok: false, reason: 'forbidden' });
    const work = body.job ? runJob(ctx, body.job) : scheduler.tick(ctx);
    EdgeRuntime.waitUntil(work.catch((e) => console.error('[axiom job]', (e as Error).message)));
    return reply(202, { ok: true });
  }

  // 1) 앱: 어드민 계정만
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: who } = await sb.auth.getUser(token);
  if (!who.user) return reply(200, { ok: false, status: 401, reason: '다시 로그인해 주세요.' });
  if (body.op === 'room.ask') {
    try {
      return reply(200, { ok: true, data: await roomAsk(sb, ctx, who.user.id, body.args ?? {}) });
    } catch (e) {
      console.error('[room.ask]', (e as Error).message);
      return reply(200, { ok: false, status: 500, reason: 'AI가 답하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  }
  const user = await ctx.userById(who.user.id);
  if (!user) return reply(200, { ok: false, status: 403, reason: '어드민 계정만 쓸 수 있습니다.' });
  try {
    return reply(200, { ok: true, data: await handle(ctx, user, String(body.op ?? ''), body.args ?? {}) });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.status ?? 500;
    if (status >= 500) console.error('[axiom]', body.op, err.message);
    // 사람이 읽을 사유는 그대로, 그 밖의 서버 오류는 감춥니다
    return reply(200, { ok: false, status, reason: status < 500 || /[가-힣]/.test(err.message) ? err.message : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
});
