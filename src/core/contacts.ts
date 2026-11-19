// 주소록 범위
// - 어드민: 모든 이용자
// - 변호사·직원: 같은 법무법인 구성원
// - 의뢰인: 자기 사건(상담·사건방)에 함께 있는 의뢰인
import type { State } from './store';
import type { User } from './types';

export function contactsFor(me: User, s: Pick<State, 'users' | 'rooms'> & Partial<Pick<State, 'accounts'>>): User[] {
  // 사용 중지된 계정(퇴사 등)은 주소록에 안 보입니다
  const off = new Set((s.accounts ?? []).filter((a) => !a.active).map((a) => a.userId));
  const others = s.users.filter((u) => u.id !== me.id && !off.has(u.id));
  if (me.role === 'admin') return others;
  if (me.role === 'client') {
    const ids = new Set(
      s.rooms.filter((r) => (r.kind === 'case' || r.kind === 'consult') && r.memberIds.includes(me.id)).flatMap((r) => r.memberIds),
    );
    return others.filter((u) => u.role === 'client' && ids.has(u.id));
  }
  return others.filter((u) => u.role !== 'client' && !!me.firm && u.firm === me.firm);
}
