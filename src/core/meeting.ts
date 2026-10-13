// 경영 에이전트 ① 회의 청취·정리
// AI가 연결되기 전에는 규칙 기반으로 결정사항·할 일을 뽑습니다.

export type MeetingLine = { speaker?: string; text: string };

export type ActionItem = { owner?: string; task: string; due?: string };

export type MeetingNotes = {
  summary: string[];
  decisions: string[];
  actions: ActionItem[];
};

const DECISION = /(결정|확정|하기로|합의|승인|채택)/;
const ACTION = /(까지|담당|해\s?주세요|해줘|할 일|진행해|준비해|맡아)/;
const DUE = /(\d{1,2}월\s?\d{1,2}일|\d{1,2}\/\d{1,2}|오늘|내일|이번\s?주|다음\s?주|월말)/;

export function parseTranscript(raw: string): MeetingLine[] {
  return raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:：]{1,12})[:：]\s*(.+)$/);
      return m ? { speaker: m[1].trim(), text: m[2].trim() } : { text: l };
    });
}

export function summarizeMeeting(raw: string): MeetingNotes {
  const lines = parseTranscript(raw);
  const decisions: string[] = [];
  const actions: ActionItem[] = [];
  for (const line of lines) {
    if (DECISION.test(line.text)) decisions.push(line.text);
    else if (ACTION.test(line.text)) {
      const mention = line.text.match(/@(\S+)/);
      actions.push({
        owner: mention?.[1] ?? line.speaker,
        task: line.text.replace(/@\S+\s*/, ''),
        due: line.text.match(DUE)?.[0],
      });
    }
  }
  const speakers = [...new Set(lines.map((l) => l.speaker).filter(Boolean))];
  const summary = [
    `발언 ${lines.length}건${speakers.length ? `, 참석 ${speakers.join(', ')}` : ''}`,
    `결정 ${decisions.length}건, 할 일 ${actions.length}건`,
  ];
  return { summary, decisions, actions };
}

/** 통신비밀보호법: 녹음은 참석자 모두에게 알리고 동의를 받은 뒤에만 시작합니다. */
export function canStartRecording(participants: string[], consents: Record<string, boolean>): boolean {
  return participants.length > 0 && participants.every((p) => consents[p]);
}
