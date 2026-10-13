// 마케팅 AI: 명령 → 계획 → 승인 → 실행. 네이버 블로그는 기존 자동화 파이프라인이 맡으므로 여기서는 다루지 않습니다.
import { similarity } from './text';

export type Channel = 'google_ads' | 'meta_ads' | 'naver_searchad' | 'homepage' | 'instagram' | 'youtube';

export const CHANNEL_LABEL: Record<Channel, string> = {
  google_ads: '구글 광고',
  meta_ads: '메타 광고',
  naver_searchad: '네이버 검색광고',
  homepage: '홈페이지',
  instagram: '인스타그램',
  youtube: '유튜브',
};

const CHANNEL_WORDS: [RegExp, Channel][] = [
  [/구글/, 'google_ads'],
  [/메타|페이스북/, 'meta_ads'],
  [/검색광고|파워링크/, 'naver_searchad'],
  [/홈페이지|웹사이트/, 'homepage'],
  [/인스타/, 'instagram'],
  [/유튜브|쇼츠/, 'youtube'],
];

export type PlanStep =
  | { kind: 'content'; channel: Channel; count: number; topic: string }
  | { kind: 'budget'; channel: Channel; changePct: number };

export type Guardrails = {
  /** 채널별 하루 예산 상한(원) */
  dailyCap: Partial<Record<Channel, number>>;
  /** 한 번에 바꿀 수 있는 예산 비율 한도 */
  maxChangePct: number;
};

export const DEFAULT_GUARDRAILS: Guardrails = {
  dailyCap: { google_ads: 300000, meta_ads: 200000, naver_searchad: 300000 },
  maxChangePct: 30,
};

export type Plan = {
  id: string;
  command: string;
  steps: PlanStep[];
  warnings: string[];
  status: '승인 대기' | '실행됨' | '반려';
};

const BLOCKED = /네이버\s?블로그|블로그/;

/** 자연어 명령을 실행 계획으로 바꿉니다. AI 연결 전에는 정해진 문형만 이해합니다. */
export function planFromCommand(id: string, command: string, budgets: Partial<Record<Channel, number>>, g = DEFAULT_GUARDRAILS): Plan {
  const steps: PlanStep[] = [];
  const warnings: string[] = [];
  const parts = command.split(/[,，]|그리고/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (BLOCKED.test(part)) {
      warnings.push('네이버 블로그는 기존 자동화 파이프라인에서 처리합니다.');
      continue;
    }
    const channel = CHANNEL_WORDS.find(([re]) => re.test(part))?.[1];
    const budget = part.match(/예산\s*(\d+)\s*%\s*(증액|감액|올|내|줄)/);
    if (budget && channel) {
      const sign = /증액|올/.test(budget[2]) ? 1 : -1;
      let pct = sign * Number(budget[1]);
      if (Math.abs(pct) > g.maxChangePct) {
        warnings.push(`${CHANNEL_LABEL[channel]} 예산 변경 ${pct}%는 한도(${g.maxChangePct}%)를 넘어 ${sign * g.maxChangePct}%로 줄였습니다.`);
        pct = sign * g.maxChangePct;
      }
      const cap = g.dailyCap[channel];
      const current = budgets[channel] ?? 0;
      if (cap !== undefined && current * (1 + pct / 100) > cap) {
        warnings.push(`${CHANNEL_LABEL[channel]} 변경 후 예산이 하루 상한 ${cap.toLocaleString('ko-KR')}원을 넘어 상한에 맞춥니다.`);
      }
      steps.push({ kind: 'budget', channel, changePct: pct });
      continue;
    }
    const count = part.match(/(\d+)\s*(건|개|편)/);
    if (count) {
      const topic = part.replace(/(\d+)\s*(건|개|편)/, '').replace(/(이번|다음)\s?주|올려|작성|발행|해줘|해|콘텐츠|글/g, '');
      const topicClean = CHANNEL_WORDS.reduce((t, [re]) => t.replace(re, ''), topic).replace(/\s+/g, ' ').trim();
      steps.push({ kind: 'content', channel: channel ?? 'homepage', count: Number(count[1]), topic: topicClean || '주제 미지정' });
      continue;
    }
    warnings.push(`이해하지 못한 지시: "${part}" (AI 연결 후 자유 문장 처리)`);
  }
  return { id, command, steps, warnings, status: '승인 대기' };
}

export function applyBudget(current: number, pct: number, cap?: number): number {
  const next = Math.round(current * (1 + pct / 100));
  return cap === undefined ? next : Math.min(next, cap);
}

export type ContentItem = { id: string; channel: Channel; title: string; body: string; status: '초안' | '승인' | '발행 대기' };

/** 기존 콘텐츠와 너무 비슷한지 (중복·저품질 판정 예방) */
export function mostSimilar(body: string, existing: ContentItem[]) {
  let best: { item: ContentItem; score: number } | undefined;
  for (const item of existing) {
    const score = similarity(body, item.body);
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}

export type Performance = { channel: Channel; topic: string; spend: number; clicks: number; inquiries: number };

/** 상담 문의로 이어진 비율이 높은 순 */
export function rankPerformance(rows: Performance[]) {
  return rows
    .map((r) => ({ ...r, costPerInquiry: r.inquiries ? Math.round(r.spend / r.inquiries) : Infinity, rate: r.clicks ? r.inquiries / r.clicks : 0 }))
    .sort((a, b) => b.rate - a.rate);
}
