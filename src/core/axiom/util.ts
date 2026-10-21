// AXIOM 공용 도우미 — 앱(기기 안 모의 실행)과 서버 함수가 같은 코드를 씁니다. 플랫폼 기능(Node·Deno)에 기대지 않습니다.

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function newId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of bytes) s += ALPHA[b & 63];
  return prefix + s;
}

export const now = () => new Date().toISOString();

export class AxError extends Error {
  status: number;
  runId?: string;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** AI 응답에서 JSON 덩어리를 꺼냅니다 (코드펜스·앞뒤 설명 허용) */
export function extractJson(text: unknown): unknown {
  if (text == null) return null;
  if (typeof text === 'object') return text;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    /* 계속 */
  }
  const starts = ['{', '['].map((c) => t.indexOf(c)).filter((i) => i >= 0);
  if (!starts.length) return null;
  const s = Math.min(...starts);
  const e = t.lastIndexOf(t[s] === '{' ? '}' : ']');
  if (e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch {
    return null;
  }
}

// 한국 시간(KST, UTC+9 — 서머타임 없음)
export const KST_MS = 9 * 3600e3;
export function kstDate(d = new Date()): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 동시 실행 제한 */
export function limiter(max: number) {
  let active = 0;
  const q: { fn: () => Promise<unknown>; res: (v: unknown) => void; rej: (e: unknown) => void }[] = [];
  const next = () => {
    if (active >= max || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift()!;
    Promise.resolve()
      .then(fn)
      .then(res, rej)
      .finally(() => {
        active--;
        next();
      });
  };
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((res, rej) => {
      q.push({ fn, res: res as (v: unknown) => void, rej });
      next();
    });
}

export function clip(s: unknown, n = 200): string {
  const v = String(s ?? '');
  return v.length > n ? v.slice(0, n) + '…' : v;
}

export function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,\s원₩$]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "1억 2천만", "3,500만원", "1.2억" 같은 한국식 금액도 숫자로
const KO_UNITS: Record<string, number> = { 조: 1e12, 억: 1e8, 천만: 1e7, 백만: 1e6, 만: 1e4, 천: 1e3 };
export function koNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[\s원₩]/g, '');
  if (!/[조억만천]/.test(s)) return num(s);
  if (!/^([\d.,]+(조|억|천만|백만|만|천)?)+$/.test(s)) return null;
  let total = 0;
  let m: RegExpExecArray | null;
  const re = /([\d.,]+)(조|억|천만|백만|만|천)?/g;
  while ((m = re.exec(s))) total += parseFloat(m[1].replace(/,/g, '')) * (KO_UNITS[m[2]] || 1);
  return Number.isFinite(total) && total ? Math.round(total) : null;
}

export const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
