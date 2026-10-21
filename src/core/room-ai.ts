// 대화방 @AI 자유 질문: 사건 수행에 관한 질문(서면, 법령·판례, 절차, 기일 준비, 증거)에만 답합니다.
// 앱과 서버 함수(axiom)가 같은 규칙을 씁니다. 실제 AI 호출은 서버에서만 (키는 서버 비밀값에만).

export type AiLevel = 'none' | 'general-info' | 'lawyer-assist' | 'work';

export const ROOM_AI_REFUSAL = '@AI는 사건 수행에 관한 질문(서면 작성, 법령·판례, 소송 절차, 기일 준비, 증거)에만 답합니다.';

const OFF = '__OFF_TOPIC__';

export const SELF_ROOM_TITLE = '나와의 메시지';

/** 나만 들어 있는 '나와의 메시지' 방 */
export function selfRoomLike(kind: string, memberCount: number, title: string): boolean {
  return kind === 'group' && memberCount === 1 && title === SELF_ROOM_TITLE;
}

/**
 * 방의 AI 답변 수준: 사건수행방은 참여 안 함, 변호사 없는 방은 일반 정보만.
 * 나와의 메시지는 다른 사람이 없으니 AI를 부를 수 있습니다 (로펌 구성원은 업무 보조, 의뢰인은 일반 정보).
 */
export function levelOf(mode: string, kind: string, hasLawyer: boolean, self?: { firm: boolean }): AiLevel {
  if (self) return self.firm ? 'lawyer-assist' : 'general-info';
  if (mode !== 'ai') return 'none';
  if (kind === 'meeting' || kind === 'marketing' || kind === 'office') return 'work';
  return hasLawyer ? 'lawyer-assist' : 'general-info';
}

export function roomAiSystem(level: AiLevel): string {
  const where =
    level === 'lawyer-assist'
      ? '변호사가 함께 있는 대화방입니다. 담당 변호사를 보조하는 의견을 냅니다. 최종 판단은 변호사가 합니다.'
      : level === 'general-info'
        ? '변호사가 없는 대화방입니다. 개별 사건에 대한 법률 판단이나 결론은 내리지 말고, 일반적인 법률 정보와 절차만 안내합니다.'
        : '법무법인 대륜 구성원들의 내부 업무 대화방입니다.';
  return [
    '당신은 법무법인(유한) 대륜 메신저의 AI 도우미입니다. 한국 법을 기준으로 한국어로 답합니다.',
    where,
    '답할 수 있는 질문은 사건 수행에 관한 것뿐입니다: 서면(소장·준비서면·의견서 등) 작성, 법령·판례, 소송·수사 절차, 기일 준비, 증거.',
    `그 밖의 질문(잡담, 일반 상식, 사건과 무관한 업무, 개인적인 부탁 등)에는 설명 없이 정확히 ${OFF} 한 단어만 답합니다.`,
    '법령·판례는 확실한 것만 말하고, 확실하지 않으면 확인이 필요하다고 밝힙니다. 판례 번호를 지어내지 않습니다.',
    '대화 기록의 참여자는 역할(변호사1, 의뢰인1 등)로만 표시됩니다. 실명을 추측하지 않습니다.',
    '메신저 답변이니 핵심부터 짧게, 필요하면 항목으로 정리합니다.',
  ].join('\n');
}

/** 실명 대신 역할로 바꾼 최근 대화 + 요청 */
export function roomAiInput(recent: { senderId: string | null; senderKind: string; text: string }[], roleOf: Record<string, string>, ask: string): string {
  const label: Record<string, string> = {};
  const count: Record<string, number> = {};
  const name = (id: string | null, kind: string) => {
    if (kind === 'ai') return 'AI';
    if (kind !== 'user' || !id) return '안내';
    if (!label[id]) {
      const r = roleOf[id] === 'lawyer' ? '변호사' : roleOf[id] === 'client' ? '의뢰인' : '직원';
      count[r] = (count[r] ?? 0) + 1;
      label[id] = `${r}${count[r]}`;
    }
    return label[id];
  };
  const lines = recent.filter((m) => m.text.trim()).map((m) => `${name(m.senderId, m.senderKind)}: ${m.text.slice(0, 1500)}`);
  return [lines.length ? `최근 대화:\n${lines.join('\n')}` : '', `요청: ${ask.replace(/@ai\b/gi, '').trim()}`].filter(Boolean).join('\n\n');
}

/** 모델 답을 메신저 문장으로: 범위 밖이면 정해진 안내 문장 */
export function finishRoomAi(text: string): { reply: string; refused: boolean } {
  const t = text.trim();
  if (!t || t.includes(OFF)) return { reply: ROOM_AI_REFUSAL, refused: true };
  return { reply: t, refused: false };
}
