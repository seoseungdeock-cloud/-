// 경영 에이전트 ② 회의 내용·결론을 쌓아 두고 비슷한 안건이 오면 근거를 꺼내 의견을 냅니다.
import { similarity } from './text';

export type DecisionRecord = {
  id: string;
  date: string;
  topic: string;
  decision: string;
  outcome?: string; // 나중에 결과가 나오면 기록 → 학습 재료
  verdict?: 'good' | 'bad';
};

export type Opinion = {
  stance: '찬성' | '반대' | '판단 보류';
  reasons: string[];
  related: { record: DecisionRecord; score: number }[];
};

export function findRelated(records: DecisionRecord[], query: string, limit = 3) {
  return records
    .map((record) => ({ record, score: similarity(query, `${record.topic} ${record.decision}`) }))
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** AI 연결 전: 과거 결정의 결과(좋음/나쁨)로 찬반을 가늠합니다. */
export function opinionFor(records: DecisionRecord[], proposal: string): Opinion {
  const related = findRelated(records, proposal);
  const judged = related.filter((r) => r.record.verdict);
  if (judged.length === 0) {
    return {
      stance: '판단 보류',
      reasons: related.length
        ? ['비슷한 과거 안건은 있지만 결과가 아직 기록되지 않았습니다.']
        : ['비슷한 과거 안건이 없습니다. 결정 후 결과를 기록하면 다음부터 의견을 냅니다.'],
      related,
    };
  }
  const good = judged.filter((r) => r.record.verdict === 'good').length;
  const bad = judged.length - good;
  return {
    stance: good >= bad ? '찬성' : '반대',
    reasons: judged.map(
      (r) => `${r.record.date} "${r.record.topic}": ${r.record.decision} → ${r.record.outcome ?? '결과 미기록'} (${r.record.verdict === 'good' ? '좋았음' : '아쉬웠음'})`,
    ),
    related,
  };
}
