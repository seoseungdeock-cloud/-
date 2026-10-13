// 대화방에서 "@AI 명령"으로 경영 에이전트·마케팅 AI 기능을 부릅니다.

export type AiCommand =
  | { kind: 'help' }
  | { kind: 'meeting'; arg: string }
  | { kind: 'opinion'; arg: string }
  | { kind: 'program'; arg: string }
  | { kind: 'image'; arg: string }
  | { kind: 'marketing'; arg: string }
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'check'; arg: string }
  | { kind: 'performance' }
  | { kind: 'chat'; arg: string };

const RULES: [RegExp, (arg: string) => AiCommand][] = [
  [/^(도움말|명령어|help)/i, () => ({ kind: 'help' })],
  [/^회의\s*정리/, (arg) => ({ kind: 'meeting', arg })],
  [/^의견/, (arg) => ({ kind: 'opinion', arg })],
  [/^(프로그램|도구)(\s*(만들어|만들기|요청))?/, (arg) => ({ kind: 'program', arg })],
  [/^(자료|이미지|차트)/, (arg) => ({ kind: 'image', arg })],
  [/^마케팅/, (arg) => ({ kind: 'marketing', arg })],
  [/^승인/, () => ({ kind: 'approve' })],
  [/^반려/, () => ({ kind: 'reject' })],
  [/^(점검|검토)/, (arg) => ({ kind: 'check', arg })],
  [/^성과/, () => ({ kind: 'performance' })],
];

export function parseAiCommand(text: string): AiCommand {
  const body = text.replace(/@ai\b/i, '').trim();
  for (const [re, make] of RULES) {
    const m = body.match(re);
    if (m) return make(body.slice(m[0].length).replace(/^[\s:：,-]+/, '').trim());
  }
  return { kind: 'chat', arg: body };
}

/** 에이전트 권한이 필요한 명령 */
export function needsAgentAccess(cmd: AiCommand): boolean {
  return cmd.kind !== 'chat' && cmd.kind !== 'help';
}

export const AI_HELP = [
  '@AI 명령',
  '· 회의 정리 — 이 방의 대화(또는 붙여 넣은 회의록)를 결정사항·할 일로 정리',
  '· 의견 [안건] — 지난 결정과 결과를 근거로 찬반',
  '· 자료 [자료 이름] — 저장된 차트를 보여주고, 아래 줄에 "라벨 값"을 적으면 최신 데이터로 다시 만듦',
  '· 프로그램 [설명] — 사내 도구 만들기 요청',
  '· 마케팅 [지시] — 예: 마케팅 홈페이지 이혼 콘텐츠 5건, 구글 예산 20% 증액',
  '· 승인 / 반려 — 가장 최근 마케팅 계획',
  '· 점검 [원고] — 광고 규정·유사도 점검',
  '· 성과 — 채널·주제별 문의 전환 순위',
].join('\n');
