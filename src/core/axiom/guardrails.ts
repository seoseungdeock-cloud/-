// 규정 점검(결정적 규칙). AI의 자체 점검과 별개로 항상 돌며, 결과는 '점검 필요' 플래그로만 붙는다.
import type { Instance } from './types';

export type Flag = { id: string; label: string; basis: string; severity: string; excerpt: string; agent?: string; step?: string };

const cache = new WeakMap<Instance, { id: string; label: string; basis: string; severity?: string; mask?: boolean; re: RegExp }[]>();

function compiled(inst: Instance) {
  const hit = cache.get(inst);
  if (hit) return hit;
  const out = [];
  for (const r of inst.guardrails || []) {
    try {
      out.push({ ...r, re: new RegExp(r.pattern, (r.flags || '') + 'g') });
    } catch {
      // 이 기기에서 쓸 수 없는 규칙은 건너뜁니다
    }
  }
  cache.set(inst, out);
  return out;
}

export function scan(inst: Instance, text: unknown): Flag[] {
  if (text == null) return [];
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  const hits: Flag[] = [];
  for (const r of compiled(inst)) {
    r.re.lastIndex = 0;
    const m = r.re.exec(s);
    if (m) {
      const start = Math.max(0, m.index - 30);
      hits.push({
        id: r.id,
        label: r.label,
        basis: r.basis,
        severity: r.severity || '중',
        excerpt: (s.slice(start, m.index) + (r.mask ? '＊＊＊' : m[0]) + s.slice(m.index + m[0].length, m.index + m[0].length + 30)).replace(/\s+/g, ' '),
      });
    }
  }
  return hits;
}
