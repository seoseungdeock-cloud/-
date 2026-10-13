// 상태 표시 (대화 가능·회의 중 등): 아바타 점 색과 글자
import { presenceOf } from '@/core/messenger';
import type { User } from '@/core/types';
import { useColors } from './theme';

export function usePresenceColor() {
  const c = useColors();
  return (u: User) => {
    const tone = presenceOf(u).tone;
    return tone === 'on' ? c.secure : tone === 'busy' ? c.warn : tone === 'dnd' ? c.accent : c.faint;
  };
}
