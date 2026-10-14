import type { Suggestion, SuggestionStatus } from './types';

export const SUGGESTION_STATUS: Record<SuggestionStatus, string> = { open: '접수', review: '검토 중', done: '반영', hold: '보류' };

export function mySuggestions(all: Suggestion[], userId: string): Suggestion[] {
  return all.filter((s) => s.authorId === userId).sort((a, b) => b.at.localeCompare(a.at));
}

/** 건의사항함: 처리 상태로 거르고 최신순 */
export function inbox(all: Suggestion[], status?: SuggestionStatus): Suggestion[] {
  return all.filter((s) => !status || s.status === status).sort((a, b) => b.at.localeCompare(a.at));
}
