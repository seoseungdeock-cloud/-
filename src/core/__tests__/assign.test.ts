import { assignChiefName, greetingDue, assignDraft, assignText, lawyerName, matchAssignments, parseAssignSheet, parseAssignText } from '../assign';

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
    expect(entries[2]).toMatchObject({ reassign: true, removed: ['정평변'], added: ['한평변'], lawyers: ['최부장', '한평변'], chief: '최부장', associates: ['한평변'], changed: 'associate' });
    expect(entries[0]).toMatchObject({ chief: '김부장', associates: ['이평변'] });

    // 배당: 승덕님 양식, 배당표에 없는 칸은 비워 둠, 돈 칸은 담지 않음
    const d0 = assignDraft(entries[0]);
    const text = assignText(d0);
    expect(text.split('\n').slice(0, 6)).toEqual(['[배당 안내]', '', '* 부장변호사 겸 주수행 변호사 : 김부장', '* 평변호사 : 이평변', '* 재판변호사 : ', '* 총괄변호사 : ']);
    expect(text).toContain('주수행 변호사님께서는 의뢰인께 배당인사 진행 부탁드리며');
    expect(text).not.toContain('상담실장');
    expect(text).not.toContain('5000000');
    const withConsult = assignText({ ...d0, fields: d0.fields.map((f) => (f.label === '상담 변호사' ? { ...f, value: '정상담' } : f.label === '상담실장' ? { ...f, value: '이실장' } : f)) });
    expect(withConsult).toContain('(상담 변호사 : 정상담 상담실장 : 이실장)');
    const n0 = parseAssignText(text)!;
    expect(n0).toMatchObject({ reassign: false, head: '[배당 안내]', chief: '김부장', associate: '이평변', full: text });

    // 재배당: 날짜 줄 '9.1 재배당' → [9월 1일 재배당 안내], 바뀐 자리·사유는 표에서
    const d2 = assignDraft(entries[2]);
    const t2 = assignText(d2);
    expect(t2.split('\n').slice(0, 7)).toEqual(['[9월 1일 재배당 안내]', '', '- 재배당 포지션 : 평 변호사', '- 재배당 사유 : 평 변호사 변경', '- 부장변호사 : 최부장 변호사', '- 평변호사 : 한평변 변호사', '- 전문인력/실장 : X']);
    expect(t2).toContain('3. 재배당 체크리스트 등록 (필수)');
    expect(parseAssignText(t2)).toMatchObject({ reassign: true, head: '[9월 1일 재배당 안내]', chief: '최부장 변호사', associate: '한평변 변호사' });
    expect(lawyerName('최부장 변호사')).toBe('최부장 변호사');
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

  it('배당인사 기한은 다음 날 (한국 날짜), 부장 이름은 변호사 떼고', () => {
    // 한국 10월 22일 23시 = UTC 14시 → 기한 10월 23일 (그날 0시 = UTC 10월 22일 15시)
    expect(greetingDue('2026-10-22T14:00:00Z').toISOString()).toBe('2026-10-22T15:00:00.000Z');
    // 한국 10월 23일 0시 30분 = UTC 10월 22일 15시 30분 → 기한 10월 24일
    expect(greetingDue('2026-10-22T15:30:00Z').toISOString()).toBe('2026-10-23T15:00:00.000Z');
    expect(assignChiefName({ reassign: true, fields: [{ label: '부장변호사', value: '정소용 변호사' }] })).toBe('정소용');
    expect(assignChiefName({ reassign: false, fields: [{ label: '부장변호사 겸 주수행 변호사', value: '' }] })).toBeNull();
  });
});
