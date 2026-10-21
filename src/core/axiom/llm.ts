// 모델 라우팅: 작업에 맞는 등급(economy/balanced/best)과 선호 제공자를 고려해 실제로 쓸 수 있는 모델을 고른다.
// AI 키는 서버 함수의 비밀값(Supabase Edge Function secrets)에만 있습니다. 앱에는 키가 없어 항상 모의 응답입니다.
import { respond } from './mock';
import type { Ctx, Env, Instance } from './types';

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'mock';
export type Msg = { role: 'user' | 'assistant'; content: string };
type Args = { model: string; system: string; messages: Msg[]; maxTokens: number; json?: boolean; meta: { role?: string; mode: string; input?: unknown; agentName: string } };
type Result = { text: string; usage: { in: number; out: number }; model: string };

export const LABEL: Record<Provider, string> = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', mock: '모의 응답' };
const KEY: Record<Exclude<Provider, 'mock'>, keyof Env> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };

export function available(env: Env): Record<Provider, boolean> {
  const forceMock = env.AXIOM_LLM === 'mock';
  return {
    anthropic: !forceMock && !!env.ANTHROPIC_API_KEY,
    openai: !forceMock && !!env.OPENAI_API_KEY,
    gemini: !forceMock && !!env.GEMINI_API_KEY,
    mock: true,
  };
}

function tierModel(inst: Instance, p: string, tier: string): string {
  const t = (inst.models?.tiers?.[p] || {}) as Record<string, string>;
  return t[tier] || t.balanced || '';
}

// spec: 'tier:balanced' | 'anthropic:claude-sonnet-5-5'
export function resolve(inst: Instance, env: Env, spec = 'tier:balanced', prefer: string | null = null): { provider: Provider; model: string; note: string | null } {
  const av = available(env);
  const m = String(spec || '').match(/^(anthropic|openai|gemini):(.+)$/);
  if (m && av[m[1] as Provider]) return { provider: m[1] as Provider, model: m[2], note: null };
  const tier = (String(spec).match(/^tier:(economy|balanced|best)$/) || [])[1] || 'balanced';
  const order = [...new Set([prefer, ...(inst.models?.fallback_order || []), 'anthropic', 'openai', 'gemini'].filter(Boolean) as string[])];
  for (const p of order) {
    if (p === 'mock' || !av[p as Provider]) continue;
    const model = tierModel(inst, p, tier);
    if (model) {
      const note = prefer && p !== prefer ? `선호 제공자(${LABEL[prefer as Provider] || prefer}) 키가 없어 ${LABEL[p as Provider]}로 대체` : null;
      return { provider: p as Provider, model, note };
    }
  }
  return { provider: 'mock', model: 'mock', note: '사용 가능한 AI 키가 없어 모의 응답으로 실행' };
}

export function cost(inst: Instance, provider: string, model: string, usage: { in: number; out: number }): number | null {
  const price = inst.models?.prices?.[`${provider}:${model}`];
  if (!price || price.in == null || price.out == null) return null;
  return (usage.in * price.in + usage.out * price.out) / 1e6;
}

// 공통 HTTP 호출: 제한 시간 + 429/5xx 1회 재시도
async function postJson(ctx: Ctx, url: string, headers: Record<string, string>, body: unknown, label: string): Promise<any> {
  const f = ctx.fetch ?? fetch;
  const timeout = Number(ctx.env.AXIOM_LLM_TIMEOUT_MS || 180000);
  let lastErr: (Error & { status?: number }) | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text.slice(0, 500) };
      }
      if (res.ok) return data;
      const msg = data?.error?.message || data?.error?.status || data?._raw || res.statusText;
      lastErr = Object.assign(new Error(`${label} ${res.status}: ${msg}`), { status: res.status });
      if (!(res.status === 429 || res.status >= 500)) throw lastErr;
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`${label}: 응답 제한 시간 초과`);
      lastErr = err;
      if (err.status && err.status < 500 && err.status !== 429) throw err;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw lastErr;
}

export async function complete(ctx: Ctx, provider: Provider, a: Args): Promise<Result> {
  if (provider === 'mock') {
    const out = respond(a.meta);
    return { text: typeof out === 'string' ? out : JSON.stringify(out), usage: { in: 0, out: 0 }, model: 'mock' };
  }
  const key = ctx.env[KEY[provider]] ?? '';
  if (provider === 'anthropic') {
    const data = await postJson(ctx, 'https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { model: a.model, max_tokens: a.maxTokens, system: a.system, messages: a.messages }, 'Claude');
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return { text, usage: { in: data.usage?.input_tokens || 0, out: data.usage?.output_tokens || 0 }, model: data.model || a.model };
  }
  if (provider === 'openai') {
    const body: Record<string, unknown> = { model: a.model, messages: [{ role: 'system', content: a.system }, ...a.messages], max_completion_tokens: a.maxTokens };
    if (a.json) body.response_format = { type: 'json_object' };
    const data = await postJson(ctx, 'https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${key}` }, body, 'OpenAI');
    return { text: data.choices?.[0]?.message?.content || '', usage: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 }, model: data.model || a.model };
  }
  const body = {
    systemInstruction: { parts: [{ text: a.system }] },
    contents: a.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: a.maxTokens, ...(a.json ? { responseMimeType: 'application/json' } : {}) },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:generateContent`;
  const data = await postJson(ctx, url, { 'x-goog-api-key': key }, body, 'Gemini');
  const text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  return { text, usage: { in: data.usageMetadata?.promptTokenCount || 0, out: data.usageMetadata?.candidatesTokenCount || 0 }, model: a.model };
}
