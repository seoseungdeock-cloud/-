// 유사도·검색에 쓰는 간단한 한국어 텍스트 도구 (AI 없이 동작)

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** 글자 3-gram 집합. 띄어쓰기·조사 차이에 덜 민감합니다. */
export function trigrams(text: string): Set<string> {
  const s = normalize(text).replace(/\s/g, '');
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  if (s.length > 0 && s.length < 3) out.add(s);
  return out;
}

/** 0~1 사이 유사도 (자카드) */
export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}
