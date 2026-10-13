import { checkCompliance } from '../compliance';
import { authorView, commentTree, score, searchPosts, sortPosts, unreadIn } from '../board';
import { contactsFor } from '../contacts';
import { opinionFor } from '../knowledge';
import { planFromCommand, rankPerformance, mostSimilar } from '../marketing';
import { summarizeMeeting } from '../meeting';
import { officeCountByRegion, searchLawyers } from '../offices';
import { aiAnswerLevel, canCreateRoom, canUseAgents } from '../rooms';
import { actions, getState, me, resetState } from '../store';
import { layoutChart, parseRows } from '../templates';
import { similarity } from '../text';
import type { Room, User } from '../types';
import { KOREA_REGIONS } from '../../data/korea-map';

const user = (p: Partial<User>): User => ({
  id: 'x', nickname: 'x', role: 'client', agentAccess: false, membership: 'basic', ...p,
});

const as = (id: string) => {
  const pw = `${id}1234`;
  expect(actions.login(id, pw).ok).toBe(true);
};

beforeEach(() => {
  resetState();
  as('admin');
});

describe('방 규칙', () => {
  it('의뢰인은 업무용 방을 만들 수 없다', () => {
    expect(canCreateRoom('office', 'ai', user({}), []).ok).toBe(false);
    expect(canCreateRoom('stranger', 'private', user({}), []).ok).toBe(true);
  });

  it('회의방은 AI 참여방으로만, 허용된 사용자만 만든다', () => {
    const admin = user({ role: 'admin' });
    const staff = user({ role: 'staff' });
    expect(canCreateRoom('meeting', 'private', admin, []).ok).toBe(false);
    expect(canCreateRoom('meeting', 'ai', admin, []).ok).toBe(true);
    expect(canCreateRoom('meeting', 'ai', staff, []).ok).toBe(false);
    expect(canUseAgents({ ...staff, agentAccess: true })).toBe(true);
    expect(canUseAgents(user({ role: 'client', agentAccess: true }))).toBe(false);
  });

  it('AI 답변 수준: 암호화방 불가, 변호사 없는 방은 일반 정보만', () => {
    const room = (mode: Room['mode']): Room => ({ id: 'r', kind: 'consult', mode, title: '', memberIds: [], createdBy: '', createdAt: '' });
    expect(aiAnswerLevel(room('private'), [])).toBe('none');
    expect(aiAnswerLevel(room('ai'), [user({})])).toBe('general-info');
    expect(aiAnswerLevel(room('ai'), [user({ role: 'lawyer' })])).toBe('lawyer-assist');
  });
});

describe('메신저 흐름', () => {
  it('사건수행방에서 @AI 를 부르면 안내만 나온다', async () => {
    await actions.sendMessage('r_direct', '@AI 요약해줘');
    const last = getState().messages.at(-1)!;
    expect(last.kind).toBe('system');
    expect(last.text).toContain('AI가 참여하지 않습니다');
  });

  it('AI 참여방에서는 AI가 답한다(미연결 표시)', async () => {
    await actions.sendMessage('r_office', '@AI 내일 일정 정리');
    const last = getState().messages.at(-1)!;
    expect(last.kind).toBe('ai');
    expect(last.text).toContain('AI 미연결');
  });

  it('상담 신청 → 사건방 전환', () => {
    as('client');
    const res = actions.requestConsult('lw_1', '이혼 상담 원합니다', 'ai');
    expect(res.ok).toBe(true);
    const roomId = res.roomId!;
    expect(actions.promoteToCase(roomId, '이혼 사건', '이혼').ok).toBe(true);
    const room = getState().rooms.find((r) => r.id === roomId)!;
    expect(room.kind).toBe('case');
    actions.addCaseEntry(roomId, { type: 'deadline', label: '1차 변론', date: '2026-11-02' });
    expect(getState().rooms.find((r) => r.id === roomId)!.caseInfo!.deadlines).toHaveLength(1);
  });

  it('어드민만 에이전트 권한을 준다', () => {
    as('staff');
    expect(actions.setAgentAccess('u_staff', true).ok).toBe(false);
    as('admin');
    expect(actions.setAgentAccess('u_staff', true).ok).toBe(true);
    expect(actions.setAgentAccess('u_client', true).ok).toBe(false);
    as('staff');
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

describe('로그인·백오피스', () => {
  it('틀린 비밀번호와 중지된 계정은 막힌다', () => {
    actions.logout();
    expect(actions.login('admin', 'nope').ok).toBe(false);
    as('admin');
    expect(actions.setAccountActive('u_staff', false).ok).toBe(true);
    expect(actions.setAccountActive('u_admin', false).ok).toBe(false);
    actions.logout();
    expect(actions.login('staff', 'staff1234')).toEqual({ ok: false, reason: expect.stringContaining('중지') });
  });

  it('어드민이 계정을 만들고 비밀번호를 초기화한다', () => {
    expect(actions.createAccount({ loginId: 'kim', password: 'short', nickname: '김', role: 'lawyer' }).ok).toBe(false);
    expect(actions.createAccount({ loginId: 'kim', password: 'password1', nickname: '김', role: 'lawyer' }).ok).toBe(true);
    expect(actions.createAccount({ loginId: 'kim', password: 'password1', nickname: '김2', role: 'client' }).ok).toBe(false);
    const kim = getState().accounts.find((a) => a.loginId === 'kim')!;
    expect(actions.resetPassword(kim.userId, 'newpass123').ok).toBe(true);
    actions.logout();
    expect(actions.login('kim', 'newpass123').ok).toBe(true);
    expect(me().nickname).toBe('김');
    expect(actions.createAccount({ loginId: 'lee', password: 'password1', nickname: '이', role: 'client' }).ok).toBe(false);
  });
});

describe('대화방 @AI 명령', () => {
  const last = () => getState().messages.at(-1)!;

  it('회의방 대화를 @AI 회의 정리로 정리한다', async () => {
    await actions.sendMessage('r_meeting', '이번 분기 검색광고 예산을 20% 늘리기로 결정합니다.');
    await actions.sendMessage('r_meeting', '@사무국 다음 주까지 소재 준비해주세요.');
    await actions.sendMessage('r_meeting', '@AI 회의 정리');
    expect(last().kind).toBe('ai');
    expect(last().text).toContain('결정사항');
    expect(last().text).toContain('[사무국]');
    expect(getState().decisions[0].decision).toContain('20%');
  });

  it('마케팅 지시 → 승인까지 대화로 한다', async () => {
    await actions.sendMessage('r_marketing', '@AI 마케팅 구글 예산 10% 증액, 홈페이지 상속 2건');
    expect(last().text).toContain('승인 대기');
    await actions.sendMessage('r_marketing', '@AI 승인');
    expect(last().text).toContain('실행됨');
    expect(getState().budgets.google_ads).toBe(110000);
  });

  it('의견·점검·자료·프로그램·도움말', async () => {
    await actions.sendMessage('r_office', '@AI 의견 검색광고 이혼 키워드 예산 늘리기');
    expect(last().text).toContain('찬성');
    await actions.sendMessage('r_office', '@AI 점검 승소율 99% 보장');
    expect(last().text).toContain('승소율');
    await actions.sendMessage('r_office', '@AI 자료 월별 상담 문의\n7월 120\n8월 130');
    expect(last().text).toContain('8월 130건');
    await actions.sendMessage('r_office', '@AI 프로그램 기일표 만들어주는 도구');
    expect(getState().programs).toHaveLength(1);
    await actions.sendMessage('r_office', '@AI 도움말');
    expect(last().text).toContain('@AI 명령');
  });

  it('허용되지 않은 사용자는 에이전트 명령을 못 쓴다', async () => {
    as('staff');
    await actions.sendMessage('r_office', '@AI 회의 정리');
    expect(last().text).toBe('이 기능은 어드민 허용이 필요합니다.');
  });
});

describe('주소록·대시보드', () => {
  it('변호사는 같은 법무법인, 의뢰인은 자기 사건의 의뢰인만 본다', () => {
    as('lawyer');
    expect(contactsFor(me(), getState()).map((u) => u.id).sort()).toEqual(['u_admin', 'u_staff']);
    as('client');
    expect(contactsFor(me(), getState())).toHaveLength(0);
  });

  it('바로 수임 요청하면 사건방이 열리고, 주소록에서 1:1 방을 연다', () => {
    as('client');
    const res = actions.requestRetain('lw_1', '이혼', '상담 원합니다');
    const room = getState().rooms.find((r) => r.id === res.roomId)!;
    expect(room.kind).toBe('case');
    expect(room.memberIds).toEqual(['u_client', 'u_lawyer']);
    as('admin');
    const id = actions.openDirect('u_staff');
    expect(id).toBe('r_direct');
    expect(actions.openDirect('u_lawyer')).not.toBe('r_direct');
  });
});

describe('익명 게시판', () => {
  beforeEach(() => resetState());

  it('모든 계정이 쓰고, 의뢰인·변호사 구분 없이 익명 1, 2…로만 보인다', () => {
    as('staff');
    const res = actions.createPost({ title: '질문', body: '내용', field: '민사' });
    expect(res.ok).toBe(true);
    as('client');
    expect(actions.commentPost(res.postId!, '저도 궁금해요').ok).toBe(true);
    as('lawyer');
    expect(actions.commentPost(res.postId!, '답변드립니다').ok).toBe(true);
    const post = getState().posts.find((p) => p.id === res.postId)!;
    const users = getState().users;
    expect(authorView(me(), post, 'u_staff', users)).toEqual({ alias: '익명 1', real: undefined });
    expect(authorView(me(), post, 'u_client', users)).toEqual({ alias: '익명 2', real: undefined });
    expect(authorView(me(), post, 'u_lawyer', users)).toEqual({ alias: '익명 3', real: undefined });
  });

  it('어드민만 실제 작성자를 본다', () => {
    as('admin');
    const post = getState().posts.find((p) => p.id === 'p1')!;
    expect(authorView(me(), post, post.authorId, getState().users).real).toBe('하늘 · 의뢰인');
  });

  it('빈 글·댓글, 분야 없는 글은 거절한다', () => {
    as('client');
    expect(actions.createPost({ title: ' ', body: '내용', field: '민사' }).ok).toBe(false);
    expect(actions.createPost({ title: '제목', body: '내용', field: '' }).ok).toBe(false);
    expect(actions.commentPost('p1', '').ok).toBe(false);
  });

  it('추천은 한 사람 한 표, 다시 누르면 취소, 반대로 누르면 바뀐다', () => {
    as('lawyer');
    const before = score(getState().posts.find((p) => p.id === 'p2')!.votes);
    actions.votePost('p2', 1);
    expect(score(getState().posts.find((p) => p.id === 'p2')!.votes)).toBe(before + 1);
    actions.votePost('p2', -1);
    expect(score(getState().posts.find((p) => p.id === 'p2')!.votes)).toBe(before - 1);
    actions.votePost('p2', -1);
    expect(score(getState().posts.find((p) => p.id === 'p2')!.votes)).toBe(before);
  });

  it('답글은 부모 댓글 아래에 들여쓰기된다', () => {
    const tree = commentTree(getState().posts.find((p) => p.id === 'p1')!);
    expect(tree.map((x) => [x.c.id, x.depth])).toEqual([['pc1', 0], ['pc2', 1]]);
  });

  it('익명 쪽지: 보내고 받고, 읽으면 안 읽은 수가 사라진다', () => {
    as('staff');
    const res = actions.openNote('p1', 'u_lawyer');
    expect(res.ok).toBe(true);
    expect(actions.openNote('p1', 'u_lawyer').noteId).toBe(res.noteId);
    expect(actions.openNote('p2', 'u_staff').ok).toBe(false);
    expect(actions.sendNote(res.noteId!, '자세히 여쭤봐도 될까요?').ok).toBe(true);
    as('lawyer');
    const note = getState().notes.find((n) => n.id === res.noteId)!;
    expect(unreadIn(note, 'u_lawyer')).toBe(1);
    actions.readNote(note.id);
    expect(unreadIn(getState().notes.find((n) => n.id === res.noteId)!, 'u_lawyer')).toBe(0);
  });
});

describe('게시판 베스트·검색·신고', () => {
  beforeEach(() => resetState());

  it('베스트 탭에는 추천 20개 이상인 글만 나온다', () => {
    const best = sortPosts(getState().posts, 'best');
    expect(best.map((p) => p.id)).toEqual(['p3']);
  });

  it('제목·내용·분야로 검색한다', () => {
    const posts = getState().posts;
    expect(searchPosts(posts, '보증금').map((p) => p.id)).toEqual(['p1']);
    expect(searchPosts(posts, '이혼 양육비').map((p) => p.id)).toEqual(['p3']);
    expect(searchPosts(posts, '없는단어')).toHaveLength(0);
  });

  it('글 작성자에게도 쪽지를 보낼 수 있다', () => {
    as('lawyer');
    const res = actions.openNote('p1', 'u_client');
    expect(res.ok).toBe(true);
    expect(actions.sendNote(res.noteId!, '자세히 알려주시면 답드릴게요').ok).toBe(true);
  });

  it('신고는 한 대상에 한 번, 내 글은 신고할 수 없다', () => {
    as('staff');
    expect(actions.report('p1', '욕설·비방').ok).toBe(true);
    expect(actions.report('p1', '욕설·비방').ok).toBe(false);
    expect(actions.report('p2', '기타').ok).toBe(false);
    expect(actions.report('p1', '광고·수임 유도', 'pc1').ok).toBe(true);
  });

  it('어드민이 삭제하면 관련 신고가 처리되고, 댓글은 삭제 표시로 남는다', () => {
    as('admin');
    expect(actions.deletePost('p2').ok).toBe(true);
    expect(getState().posts.some((p) => p.id === 'p2')).toBe(false);
    expect(getState().reports.find((r) => r.id === 'rp1')!.status).toBe('resolved');
    expect(actions.deleteComment('p1', 'pc1').ok).toBe(true);
    expect(getState().posts.find((p) => p.id === 'p1')!.comments.find((c) => c.id === 'pc1')!.deleted).toBe(true);
  });

  it('어드민만 삭제·제한할 수 있다', () => {
    as('lawyer');
    expect(actions.deletePost('p1').ok).toBe(false);
    expect(actions.restrictUser('u_client', 1).ok).toBe(false);
  });

  it('이용 제한된 사람은 글·댓글·추천·쪽지를 쓸 수 없고, 해제하면 다시 쓴다', () => {
    as('admin');
    expect(actions.restrictUser('u_client', 24).ok).toBe(true);
    as('client');
    expect(actions.createPost({ title: '제목', body: '내용', field: '민사' }).ok).toBe(false);
    expect(actions.commentPost('p2', '댓글').ok).toBe(false);
    expect(actions.votePost('p2', 1).ok).toBe(false);
    as('admin');
    actions.liftRestriction('u_client');
    as('client');
    expect(actions.commentPost('p2', '댓글').ok).toBe(true);
  });
});
