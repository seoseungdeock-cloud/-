import { checkCompliance } from '../compliance';
import { opinionFor } from '../knowledge';
import { planFromCommand, rankPerformance, mostSimilar } from '../marketing';
import { canStartRecording, summarizeMeeting } from '../meeting';
import { benefitAllowed, MEMBERSHIP_BENEFITS } from '../membership';
import { officeCountByRegion, searchLawyers } from '../offices';
import { aiAnswerLevel, canCreateRoom, canUseAgents } from '../rooms';
import { actions, getState, me, resetState } from '../store';
import { layoutChart, parseRows } from '../templates';
import { similarity } from '../text';
import type { Room, User } from '../types';
import { KOREA_REGIONS } from '../../data/korea-map';

const user = (p: Partial<User>): User => ({
  id: 'x', nickname: 'x', role: 'client', identityVerified: false, adultVerified: false, agentAccess: false, membership: 'basic', ...p,
});

beforeEach(() => resetState());

describe('방 규칙', () => {
  it('모르는 사람과의 대화는 성인인증이 필요하다', () => {
    const a = user({ id: 'a' });
    const b = user({ id: 'b', adultVerified: true });
    expect(canCreateRoom('stranger', 'e2ee', a, [b]).ok).toBe(false);
    expect(canCreateRoom('stranger', 'e2ee', { ...a, adultVerified: true }, [b]).ok).toBe(true);
  });

  it('회의방은 AI 참여방으로만, 허용된 사용자만 만든다', () => {
    const admin = user({ role: 'admin' });
    const staff = user({ role: 'staff' });
    expect(canCreateRoom('meeting', 'e2ee', admin, []).ok).toBe(false);
    expect(canCreateRoom('meeting', 'ai', admin, []).ok).toBe(true);
    expect(canCreateRoom('meeting', 'ai', staff, []).ok).toBe(false);
    expect(canUseAgents({ ...staff, agentAccess: true })).toBe(true);
    expect(canUseAgents(user({ role: 'client', agentAccess: true }))).toBe(false);
  });

  it('AI 답변 수준: 암호화방 불가, 변호사 없는 방은 일반 정보만', () => {
    const room = (mode: Room['mode']): Room => ({ id: 'r', kind: 'consult', mode, title: '', memberIds: [], createdBy: '', createdAt: '' });
    expect(aiAnswerLevel(room('e2ee'), [])).toBe('none');
    expect(aiAnswerLevel(room('ai'), [user({})])).toBe('general-info');
    expect(aiAnswerLevel(room('ai'), [user({ role: 'lawyer' })])).toBe('lawyer-assist');
  });
});

describe('메신저 흐름', () => {
  it('암호화방에서 @AI 를 부르면 안내만 나온다', async () => {
    await actions.sendMessage('r_direct', '@AI 요약해줘');
    const last = getState().messages.at(-1)!;
    expect(last.kind).toBe('system');
    expect(last.text).toContain('AI가 참여할 수 없습니다');
  });

  it('AI 참여방에서는 AI가 답한다(미연결 표시)', async () => {
    await actions.sendMessage('r_office', '@AI 내일 일정 정리');
    const last = getState().messages.at(-1)!;
    expect(last.kind).toBe('ai');
    expect(last.text).toContain('AI 미연결');
  });

  it('상담방 → 사건방 전환은 본인확인 후에만 된다', () => {
    actions.switchUser('u_client');
    const res = actions.requestConsult('lw_1', '이혼 상담 원합니다', 'ai');
    expect(res.ok).toBe(true);
    const roomId = res.roomId!;
    expect(actions.promoteToCase(roomId, '이혼 사건', '이혼').ok).toBe(false);
    actions.verify('identity');
    expect(actions.promoteToCase(roomId, '이혼 사건', '이혼').ok).toBe(true);
    const room = getState().rooms.find((r) => r.id === roomId)!;
    expect(room.kind).toBe('case');
    actions.addCaseEntry(roomId, { type: 'deadline', label: '1차 변론', date: '2026-11-02' });
    expect(getState().rooms.find((r) => r.id === roomId)!.caseInfo!.deadlines).toHaveLength(1);
  });

  it('어드민만 에이전트 권한을 준다', () => {
    actions.switchUser('u_staff');
    expect(actions.setAgentAccess('u_staff', true).ok).toBe(false);
    actions.switchUser('u_admin');
    expect(actions.setAgentAccess('u_staff', true).ok).toBe(true);
    expect(actions.setAgentAccess('u_client', true).ok).toBe(false);
    actions.switchUser('u_staff');
    expect(canUseAgents(me())).toBe(true);
  });
});

describe('지도·검색', () => {
  it('시·도 17개 경로가 있다', () => {
    expect(KOREA_REGIONS).toHaveLength(17);
    expect(KOREA_REGIONS.every((r) => r.d.startsWith('M'))).toBe(true);
  });
  it('지역·분야 필터와 고객이 고른 정렬', () => {
    expect(officeCountByRegion()['11']).toBe(1);
    const rows = searchLawyers({ field: '형사', sort: 'career' });
    expect(rows.map((r) => r.id)).toEqual(['lw_5', 'lw_2']);
    expect(searchLawyers({ regionCode: '21', sort: 'name' })).toHaveLength(1);
  });
});

describe('경영 에이전트', () => {
  const transcript = `승덕: 검색광고 예산을 20% 늘리기로 결정합니다.
직원: @김대리 다음 주까지 광고 소재 3개 준비해주세요.
변호사: 이번 달 상담 건수가 늘었습니다.`;

  it('회의 정리: 결정과 할 일을 뽑는다', () => {
    const n = summarizeMeeting(transcript);
    expect(n.decisions).toHaveLength(1);
    expect(n.actions[0]).toMatchObject({ owner: '김대리', due: '다음 주' });
  });

  it('녹음은 전원 동의 후에만', () => {
    expect(canStartRecording(['a', 'b'], { a: true })).toBe(false);
    expect(canStartRecording(['a', 'b'], { a: true, b: true })).toBe(true);
  });

  it('과거 결정 결과로 의견을 낸다', () => {
    const op = opinionFor(getState().decisions, '검색광고 이혼 키워드 예산 더 늘리기');
    expect(op.stance).toBe('찬성');
    expect(op.related[0].record.id).toBe('d1');
  });

  it('템플릿 데이터 파싱과 차트 배치', () => {
    const rows = parseRows('7월 120\n8월 1,300\n잘못된 줄');
    expect(rows).toEqual([{ label: '7월', value: 120 }, { label: '8월', value: 1300 }]);
    const l = layoutChart(rows, 300, 200);
    expect(l[1].h).toBeGreaterThan(l[0].h);
  });
});

describe('마케팅 AI', () => {
  it('명령을 계획으로 바꾸고 한도를 지킨다', () => {
    const p = planFromCommand('p', '홈페이지 이혼 콘텐츠 5건, 구글 예산 50% 증액, 네이버 블로그 10건', { google_ads: 100000 });
    expect(p.steps).toEqual([
      { kind: 'content', channel: 'homepage', count: 5, topic: '이혼' },
      { kind: 'budget', channel: 'google_ads', changePct: 30 },
    ]);
    expect(p.warnings.some((w) => w.includes('네이버 블로그'))).toBe(true);
  });

  it('승인하면 예산 변경과 초안이 반영된다', () => {
    const plan = actions.planCommand('메타 예산 10% 증액, 인스타 상속 2건');
    expect(actions.approvePlan(plan.id).ok).toBe(true);
    const s = getState();
    expect(s.budgets.meta_ads).toBe(88000);
    expect(s.contents.filter((c) => c.channel === 'instagram')).toHaveLength(2);
    expect(s.contents[0].body).toContain('AI의 도움');
  });

  it('광고 규정 위반 표현을 잡는다', () => {
    const issues = checkCompliance('승소율 98%! 최고의 이혼 전문변호사, 전관 출신');
    expect(issues.map((i) => i.reason)).toEqual(expect.arrayContaining([
      '승소율 등 결과 보장·암시 표현',
      '객관적 근거 없는 비교·최상급 표현',
    ]));
    expect(checkCompliance('이혼 절차를 쉽게 설명합니다')).toHaveLength(0);
  });

  it('유사도와 성과 순위', () => {
    expect(similarity('이혼 재산분할 안내', '이혼 재산분할 안내')).toBe(1);
    const best = mostSimilar('이혼할 때 재산분할은 함께 모은 재산을 나누는 절차', getState().contents);
    expect(best!.score).toBeGreaterThan(0.3);
    expect(rankPerformance(getState().performance)[0].topic).toBe('이혼');
  });
});

describe('라잇나우 멤버십', () => {
  it('혜택에 변호사 할인·우선배정이 없다', () => {
    expect(MEMBERSHIP_BENEFITS.every(benefitAllowed)).toBe(true);
    expect(benefitAllowed({ title: '수임료 10% 할인', detail: '' })).toBe(false);
  });
});
