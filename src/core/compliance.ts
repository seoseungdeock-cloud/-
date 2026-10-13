// 마케팅 콘텐츠 사전 점검: 변협 '변호사 광고에 관한 규정' 등에서 문제가 되기 쉬운 표현.
// 법적 판단을 대신하지 않으며, 발행 전 사람이 한 번 승인하는 단계를 둡니다.

export type ComplianceIssue = { phrase: string; reason: string };

const RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /승소율|승소\s?확률|\d+\s?%\s?승소/g, reason: '승소율 등 결과 보장·암시 표현' },
  { pattern: /무조건|반드시\s?(승소|이깁|해결)|100\s?%|보장(합니다|해\s?드립)/g, reason: '결과를 보장하는 표현' },
  { pattern: /최고|최초|유일|1위|넘버원|No\.?\s?1/gi, reason: '객관적 근거 없는 비교·최상급 표현' },
  { pattern: /전관|前\s?(판사|검사)|출신\s?(판사|검사)/g, reason: '전관 표시 (법무부 가이드라인상 금지 키워드)' },
  { pattern: /전문\s?변호사|전문(가|팀)?(입니다|으로)/g, reason: "변협 전문분야 등록 없이 '전문' 표기 금지" },
  { pattern: /수임료\s?\d|착수금\s?\d|성공보수\s?\d/g, reason: '수임료 사전 표시 (상담료만 표시 가능)' },
];

export function checkCompliance(text: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) issues.push({ phrase: m[0], reason: rule.reason });
  }
  return issues;
}

/** AI기본법(2026.1 시행): 생성형 AI 결과물 표시 */
export const AI_DISCLOSURE = '이 콘텐츠는 AI의 도움을 받아 작성되었습니다.';
