import { branchGroups, NO_BRANCH, NO_DEPT, orgGroups, orgLine } from '../messenger';
import type { User } from '../types';

const u = (id: string, p: Partial<User>): User => ({ id, nickname: id, role: 'staff', agentAccess: false, membership: 'basic', ...p });

describe('조직도 정렬', () => {
  const people = [
    u('가', { dept: '상담팀', deptOrder: 15, branch: '부산', rankOrder: 10, title: '변호사' }),
    u('나', { dept: '상담팀', deptOrder: 15, branch: '부산', rankOrder: 1, title: '시니어' }),
    u('다', { dept: '경영본부', deptOrder: 1, branch: '본사', rankOrder: 3 }),
    u('라', { dept: '상담팀', deptOrder: 15, branch: '부산' }), // 직급 순서 없음 → 뒤
    u('마', {}), // 부서·지점 없음
  ];
  test('부서는 대륜탑 표시 순서, 사람은 직급 순, 미지정은 맨 뒤', () => {
    const g = orgGroups(people);
    expect(g.map((x) => x.dept)).toEqual(['경영본부', '상담팀', NO_DEPT]);
    expect(g[1].members.map((m) => m.id)).toEqual(['나', '가', '라']);
  });
  test('지점 안은 다시 부서로 묶임', () => {
    const b = branchGroups(people);
    expect(b.map((x) => x.branch)).toEqual(['본사', '부산', NO_BRANCH]);
    expect(b[1].depts).toHaveLength(1);
    expect(b[1].depts[0].members.map((m) => m.id)).toEqual(['나', '가', '라']);
  });
  test('한 줄 설명: 부서 · 직책 · 직군 (직급과 같은 직군은 생략)', () => {
    expect(orgLine(u('x', { dept: '상담팀', duty: '소장', job: '변호사', title: '수석변호사' }))).toBe('상담팀 · 소장 · 변호사');
    expect(orgLine(u('x', { dept: '상담팀', job: '변호사', title: '변호사' }), true)).toBe('');
  });
});
