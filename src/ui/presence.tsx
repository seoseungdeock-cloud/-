// 상태 표시 (회의 중·재판 중 등): 아바타 오른쪽 아래 작은 이모지 배지 (대화 가능은 표시 없음, 웍스처럼)
import { presenceOf } from '@/core/messenger';
import type { User } from '@/core/types';

export function usePresenceBadge() {
  return (u: User) => presenceOf(u).emoji;
}
