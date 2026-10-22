import { assignText, matchAssignments, parseAssignSheet, parseAssignText } from '../assign';

// 그룹 배당표와 같은 모양의 가짜 표 (이름·사건은 모두 지어낸 것)
const H = ['날짜', '의뢰인', '사건명', '관할', '사건진행정도', '부', '담당', '담당변호사', '', '', '전문인력', '전문인력\n결재자', '단독부/\n합의부', '수임사무소', '착수금', '', '', '비고'];
const SUB = ['', '', '', '', '', '', '', '부장변호사', '평변호사', '', '', '', '', '', '착수금', '입금액', '입금비율', '요청사항'];
const row = (o: Record<number, string>) => H.map((_, i) => o[i] ?? '');
const TABLE = [
  H, SUB,
  row({ 0: '10.22 목 (1)' }),
  row({ 1: '가나다', 2: '사기', 3: '서울중앙지검', 7: '김부장', 8: '이평변', 14: '5000000' }),
  row({ 1: '라마바', 2: '폭행', 3: '수원지법', 7: '박부장', 8: '.' }),
  row({ 0: '9.1 재배당' }),
  row({ 1: '사아자', 2: '횡령', 3: '대구지검', 7: '최부장', 8: '정평변 삭제', 9: '한평변 추가' }),
];

describe('배당 안내', () => {
  it('배당표에서 날짜 묶음·재배당·담당 변호사를 읽고 돈 칸은 담지 않음', () => {
    const { entries, error } = parseAssignSheet(TABLE);
    expect(error).toBeUndefined();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ section: '10.22 목 (1)', reassign: false, client: '가나다', caseName: '사기', court: '서울중앙지검', lawyers: ['김부장', '이평변'] });
    expect(entries[1].lawyers).toEqual(['박부장']);
    expect(entries[2]).toMatchObject({ reassign: true, removed: ['정평변'], added: ['한평변'], lawyers: ['최부장', '한평변'] });
    const text = assignText(entries[0]);
    expect(text).toBe('[배당 안내] 사기\n관할: 서울중앙지검\n담당 변호사: 김부장, 이평변');
    expect(text).not.toContain('5000000');
    expect(assignText(entries[2])).toContain('[재배당 안내] 횡령');
    expect(parseAssignText(assignText(entries[2]))).toEqual({
      reassign: true, caseName: '횡령',
      fields: [{ label: '관할', value: '대구지검' }, { label: '담당 변호사', value: '최부장, 한평변' }, { label: '변경', value: '정평변 제외, 한평변 추가' }],
    });
    expect(parseAssignText('그냥 대화')).toBeNull();
  });

  it('의뢰인 이름으로 사건방을 찾고, 여럿이면 사건명이 든 방, 그래도 모르면 사람이 고름', () => {
    const { entries } = parseAssignSheet(TABLE);
    const rooms = [
      { id: 'r1', title: '사기 사건', clients: ['가나다'] },
      { id: 'r2', title: '임대차', clients: ['가나다'] },
      { id: 'r3', title: '폭행 A', clients: ['라마바'] },
      { id: 'r4', title: '폭행 B', clients: ['라마바'] },
    ];
    const m = matchAssignments(entries, rooms);
    expect(m[0].roomId).toBe('r1');
    expect(m[1].roomId).toBeUndefined();
    expect(m[1].candidates.map((r) => r.id)).toEqual(['r3', 'r4']);
    expect(m[2].candidates).toEqual([]);
  });

  it('배당표 모양이 아니면 알려 줌', () => {
    expect(parseAssignSheet([['a', 'b']]).error).toContain('의뢰인');
  });
});
