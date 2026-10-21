// 업무 탭 AXIOM 이 부르는 곳. 서버가 있으면 서버 함수 'axiom'(실제 AI 키는 서버 비밀값에만)으로,
// 없으면(미리보기·체험) 기기 안에서 같은 엔진을 모의 응답으로 돌립니다.
import { getState } from '../store';
import { reasonOf, serverEnabled, supabase } from '../supabase';
import type { User } from '../types';
import { handle, runJob } from './api';
import { MemoryDb } from './db';
import { INSTANCE } from './instance';
import type { AxUser, Ctx } from './types';
import { AxError } from './util';

export type AxResult<T = any> = { ok: true; data: T } | { ok: false; reason: string; status?: number };

/** 라잇나우 계정 → AXIOM 권한: 관리자어드민은 관리자, 다른 어드민은 모든 팀의 팀장 */
export function axUser(u: User): AxUser | null {
  if (u.role !== 'admin') return null;
  return { id: u.id, name: u.nickname, role: u.superAdmin ? 'admin' : 'lead', teams: INSTANCE.teams.map((t) => t.key) };
}

let local: Ctx | null = null;
function localCtx(): Ctx {
  if (local) return local;
  const ctx: Ctx = {
    db: new MemoryDb(),
    inst: INSTANCE,
    env: {},
    async names(ids) {
      const out: Record<string, string> = {};
      for (const u of getState().users) if (ids.includes(u.id)) out[u.id] = u.nickname;
      return out;
    },
    async userById(id) {
      const u = getState().users.find((x) => x.id === id);
      return u ? axUser(u) : null;
    },
    async owner() {
      const u = getState().users.find((x) => x.role === 'admin' && x.superAdmin);
      return u ? axUser(u) : null;
    },
    spawn(job) {
      setTimeout(() => void runJob(ctx, job).catch(() => undefined), 30);
    },
  };
  return (local = ctx);
}

/** 시험용: 기기 안 AXIOM 자료 비우기 */
export function resetLocalAxiom() {
  local = null;
}

export async function axiom<T = any>(user: User, op: string, args: Record<string, unknown> = {}): Promise<AxResult<T>> {
  const ax = axUser(user);
  if (!ax) return { ok: false, reason: '어드민 계정만 쓸 수 있습니다.', status: 403 };
  if (serverEnabled && supabase) {
    const { data, error } = await supabase.functions.invoke('axiom', { body: { op, args } });
    if (error) {
      let reason = reasonOf(error);
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.reason) reason = body.reason;
      } catch {
        // 본문 없음
      }
      return { ok: false, reason };
    }
    if (data?.ok === false) return { ok: false, reason: data.reason, status: data.status };
    return { ok: true, data: data?.data as T };
  }
  try {
    return { ok: true, data: (await handle(localCtx(), ax, op, args)) as T };
  } catch (e) {
    const err = e as AxError;
    return { ok: false, reason: err.message || '처리하지 못했습니다.', status: err.status };
  }
}
