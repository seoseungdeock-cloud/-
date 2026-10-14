// 앱 ↔ 서버 끝까지 시험. supabase/tests/e2e.sh 로만 실행합니다 (로컬 가짜 서버가 필요).
import { aliasIn } from '../board';
import { pendingFor } from '../hearings';
import { unreadCount } from '../messenger';
import { actions, clearSyncError, getState, me, refresh, settled } from '../store';
import { serverEnabled } from '../supabase';

const GW = process.env.E2E_GATEWAY!;
const post = async (path: string, body: unknown) => {
  const r = await fetch(`${GW}${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
  return r.json();
};
const sql = (q: string) => post('/__sql', q);

const ID = {
  admin: '00000000-0000-4000-8000-00000000000a',
  lawyer: '00000000-0000-4000-8000-00000000000c',
  staff: '00000000-0000-4000-8000-00000000000d',
  client: '00000000-0000-4000-8000-00000000000e',
  client2: '00000000-0000-4000-8000-00000000000f',
};
const CASE_ROOM = '10000000-0000-4000-8000-000000000001';

async function as(login: keyof typeof ID) {
  actions.logout();
  const r = await actions.signIn(login, `${login}-pass-1234`);
  expect(r).toEqual({ ok: true });
  expect(me().id).toBe(ID[login]);
}
async function done() {
  await settled();
  expect(getState().syncError).toBeUndefined();
}

jest.setTimeout(30_000);

beforeAll(async () => {
  expect(serverEnabled).toBe(true);
  const seed = [
    { login: 'admin', nickname: '관리자', role: 'admin', firm: '대륜', superAdmin: true },
    { login: 'lawyer', nickname: '김변호', role: 'lawyer', firm: '대륜' },
    { login: 'staff', nickname: '이직원', role: 'staff', firm: '대륜' },
    { login: 'client', nickname: '박의뢰', role: 'client' },
    { login: 'client2', nickname: '최의뢰', role: 'client' },
  ] as const;
  for (const u of seed) await post('/__seed', { id: ID[u.login], password: `${u.login}-pass-1234`, ...u });
  // 의뢰인·변호사가 함께 있는 사건방 (찾기→수임 연결은 변호사 계정 연동 뒤에 생김)
  await sql(`insert into rooms (id, kind, mode, title) values ('${CASE_ROOM}', 'case', 'private', '임대차 · 김변호');
    insert into room_members (room_id, user_id, is_master) values ('${CASE_ROOM}', '${ID.lawyer}', true), ('${CASE_ROOM}', '${ID.client}', false);
    insert into cases (room_id, title, field, stage) values ('${CASE_ROOM}', '임대차 · 김변호', '부동산', '수임');`);
});

describe('로그인', () => {
  it('틀린 비밀번호는 거절', async () => {
    actions.logout();
    expect(await actions.signIn('lawyer', 'wrong')).toEqual({ ok: false, reason: '아이디 또는 비밀번호가 맞지 않습니다.' });
  });
  it('중지된 계정은 거절', async () => {
    await sql(`update profiles set active = false where id = '${ID.client2}'`);
    actions.logout();
    const r = await actions.signIn('client2', 'client2-pass-1234');
    expect(r.ok).toBe(false);
    await sql(`update profiles set active = true where id = '${ID.client2}'`);
  });
  it('로그인하면 서버 데이터만 보임 (예시 데이터 없음)', async () => {
    await as('lawyer');
    const s = getState();
    expect(s.users.map((u) => u.nickname).sort()).toEqual(['관리자', '김변호', '박의뢰', '이직원'].sort());
    expect(s.rooms.map((r) => r.id)).toEqual([CASE_ROOM]);
    expect(s.rooms[0].caseInfo?.stage).toBe('수임');
  });
});

describe('메신저', () => {
  let roomId = '';
  it('방 만들기·메시지·공감·공지가 서버에 남고 다시 로그인해도 그대로', async () => {
    await as('lawyer');
    const r = actions.createRoom({ kind: 'group', mode: 'private', title: '상담팀', memberIds: [ID.staff] });
    expect(r.ok).toBe(true);
    roomId = r.roomId!;
    await actions.sendMessage(roomId, '내일 기일 서류 준비 부탁드립니다');
    const msg = getState().messages.find((m) => m.text === '내일 기일 서류 준비 부탁드립니다')!;
    actions.react(msg.id, '👍');
    expect(actions.setNotice(msg.id).ok).toBe(true);
    actions.togglePin(roomId);
    await done();

    await as('staff');
    const room = getState().rooms.find((x) => x.id === roomId)!;
    expect(room.memberIds).toEqual([ID.lawyer, ID.staff]);
    expect(room.masters).toEqual([ID.lawyer]);
    expect(room.notices?.[0].text).toBe('내일 기일 서류 준비 부탁드립니다');
    expect(room.pinnedBy).toEqual([ID.lawyer]);
    const texts = getState().messages.filter((m) => m.roomId === roomId).map((m) => m.text);
    expect(texts[0]).toContain('사건수행방이 만들어졌습니다');
    expect(texts).toContain('내일 기일 서류 준비 부탁드립니다');
    const got = getState().messages.find((m) => m.id === msg.id)!;
    expect(got.reactions).toEqual({ [ID.lawyer]: '👍' });
    expect(unreadCount(room, ID.staff, getState().messages, getState().reads)).toBeGreaterThan(0);
    actions.markRead(roomId);
    await done();
    await refresh();
    expect(unreadCount(getState().rooms.find((x) => x.id === roomId)!, ID.staff, getState().messages, getState().reads)).toBe(0);
  });

  it('마스터가 나가면 남은 사람이 마스터, 서버도 같게', async () => {
    await as('lawyer');
    expect(actions.leaveRoom(roomId).ok).toBe(true);
    await done();
    await as('staff');
    const room = getState().rooms.find((x) => x.id === roomId)!;
    expect(room.memberIds).toEqual([ID.staff]);
    expect(room.masters).toEqual([ID.staff]);
    expect(getState().messages.filter((m) => m.roomId === roomId).map((m) => m.text)).toEqual(
      expect.arrayContaining(['김변호님이 나갔습니다.', '이직원님이 마스터가 되었습니다.']),
    );
  });

  it('서버가 거절하면 사유를 띄우고 서버 상태로 되돌림', async () => {
    await as('client');
    // 의뢰인은 모르는 직원과 방을 만들 수 없음 (앱 규칙에는 없고 서버 규칙에만 있는 경우)
    const r = actions.createRoom({ kind: 'group', mode: 'private', title: '몰래', memberIds: [] });
    expect(r.ok).toBe(true);
    await settled();
    await refresh();
    expect(getState().rooms.some((x) => x.title === '몰래')).toBe(true); // 자기 혼자 방은 허용
    getState().users.push({ id: ID.staff, nickname: '이직원', role: 'staff', agentAccess: false, membership: 'basic' });
    actions.createRoom({ kind: 'direct', mode: 'private', title: '', memberIds: [ID.staff] });
    await settled();
    expect(getState().syncError).toBe('초대할 수 없는 사람이 있습니다.');
    await refresh();
    expect(getState().rooms.some((x) => x.kind === 'direct')).toBe(false);
    actions.logout();
  });
});

describe('사건·기일', () => {
  it('변호사가 올린 기일 알람을 의뢰인이 받고 확인', async () => {
    await as('lawyer');
    const r = actions.syncHearing(CASE_ROOM, { change: 'new', label: '변론기일', date: '2026-11-19', time: '10:00', place: '서울중앙지법 301호' });
    expect(r.ok).toBe(true);
    actions.addCaseEntry(CASE_ROOM, { type: 'cost', label: '인지대', amount: 50000 });
    actions.setCaseStage(CASE_ROOM, '진행');
    await done();

    await as('client');
    const room = getState().rooms.find((x) => x.id === CASE_ROOM)!;
    expect(room.caseInfo?.stage).toBe('진행');
    expect(room.caseInfo?.deadlines).toEqual([expect.objectContaining({ label: '변론기일', date: '2026-11-19', time: '10:00' })]);
    expect(room.caseInfo?.costs).toEqual([expect.objectContaining({ label: '인지대', amount: 50000 })]);
    expect(room.notices?.[0].by).toBe('bot');
    const pending = pendingFor(ID.client, getState().hearingAlerts);
    expect(pending.map((a) => a.id)).toEqual([r.ok && 'alertId' in r ? r.alertId : '']);
    const card = getState().messages.find((m) => m.hearingAlertId === pending[0].id);
    expect(card?.senderId).toBe('bot');
    expect(actions.ackHearing(pending[0].id).ok).toBe(true);
    await done();

    await as('lawyer');
    const a = getState().hearingAlerts.find((x) => x.id === pending[0].id)!;
    expect(Object.keys(a.ackedBy).sort()).toEqual([ID.client, ID.lawyer].sort());
    expect(getState().messages.some((m) => m.text === '박의뢰님이 변론기일 알람을 확인했습니다.')).toBe(true);
  });

  it('의뢰인의 수임 요청은 사건수행방으로 서버에 남음', async () => {
    await as('client');
    const r = actions.requestRetain('lw_1', '이혼', '상담 부탁드립니다');
    expect(r.ok).toBe(true);
    await done();
    await refresh();
    const room = getState().rooms.find((x) => x.id === r.roomId)!;
    expect(room).toMatchObject({ kind: 'case', mode: 'private', lawyerId: 'lw_1' });
    expect(room.caseInfo?.progress.map((p) => p.note)).toEqual(['수임 요청']);
    expect(getState().messages.filter((m) => m.roomId === room.id).map((m) => m.senderId)).toEqual(['system', 'system', 'bot', ID.client]);
  });
});

describe('익명 게시판', () => {
  it('작성자는 익명 번호로만, 어드민은 실제 작성자', async () => {
    await as('client');
    const r = actions.createPost({ title: '보증금', body: '돌려받는 방법이 궁금합니다', field: '민사' });
    expect(r.ok).toBe(true);
    await done();

    await as('client2');
    const p = getState().posts.find((x) => x.id === r.postId)!;
    expect(p.authorId).not.toBe(ID.client);
    expect(aliasIn(p, p.authorId)).toBe('익명 1');
    expect(actions.commentPost(p.id, '저도 궁금해요').ok).toBe(true);
    expect(actions.votePost(p.id, 1).ok).toBe(true);
    const n = actions.openNote(p.id, p.authorId);
    expect(n.ok).toBe(true);
    expect(actions.sendNote(n.noteId!, '연락 가능할까요').ok).toBe(true);
    await done();
    await refresh();
    const p2 = getState().posts.find((x) => x.id === r.postId)!;
    expect(aliasIn(p2, ID.client2)).toBe('익명 2');
    expect(p2.votes).toEqual({ [ID.client2]: 1 });

    await as('client');
    const p3 = getState().posts.find((x) => x.id === r.postId)!;
    expect(p3.authorId).toBe(ID.client);
    expect(Object.values(p3.votes)).toEqual([1]);
    expect(aliasIn(p3, p3.comments[0].authorId)).toBe('익명 2');
    const note = getState().notes[0];
    expect(note.messages.map((m) => m.text)).toEqual(['연락 가능할까요']);
    expect(aliasIn(p3, note.memberIds[1])).toBe('익명 2');

    await as('admin');
    const p4 = getState().posts.find((x) => x.id === r.postId)!;
    expect(p4.authorId).toBe(ID.client);
    expect(actions.restrictUser(ID.client2, 24).ok).toBe(true);
    await done();
    await as('client2');
    expect(actions.commentPost(p.id, '또 씀').ok).toBe(false);
  });
});

describe('오픈대화방', () => {
  it('비밀번호는 서버가 확인하고, 다른 참여자는 닉네임으로만', async () => {
    await as('lawyer');
    const r = actions.createOpenRoom({ title: '형사 실무', description: '', tags: '형사', max: 30, alias: '익명변호사', password: 'pass1234' });
    expect(r.ok).toBe(true);
    await done();

    await as('staff');
    const room = getState().openRooms.find((x) => x.id === r.roomId)!;
    expect(room.locked).toBe(true);
    expect(room.password).toBeUndefined();
    expect(room.members.map((m) => m.userId)).not.toContain(ID.lawyer);
    actions.joinOpenRoom(room.id, '직원A', 'wrong');
    await settled();
    expect(getState().syncError).toBe('비밀번호가 맞지 않습니다.');
    await refresh();
    expect(getState().openRooms.find((x) => x.id === room.id)!.members.length).toBe(1);
    clearSyncError();
    expect(actions.joinOpenRoom(room.id, '직원A', 'pass1234').ok).toBe(true);
    expect(actions.sendOpen(room.id, '안녕하세요').ok).toBe(true);
    await done();
    await refresh();
    const after = getState().openRooms.find((x) => x.id === room.id)!;
    expect(after.members.map((m) => m.alias)).toEqual(['익명변호사', '직원A']);
    expect(getState().openMessages.filter((m) => m.roomId === room.id).map((m) => m.text)).toContain('안녕하세요');

    await as('admin');
    const watched = getState().openRooms.find((x) => x.id === room.id)!;
    expect(watched.members.map((m) => m.userId)).toEqual([ID.lawyer, ID.staff]);
  });
});

describe('백오피스', () => {
  it('어드민이 만든 계정으로 바로 로그인', async () => {
    await as('admin');
    expect(actions.createAccount({ loginId: 'newlawyer', password: 'newlawyer-1234', nickname: '정변호', role: 'lawyer', firm: '대륜' }).ok).toBe(true);
    await done();
    await settled();
    await refresh();
    expect(getState().accounts.some((a) => a.loginId === 'newlawyer')).toBe(true);
    actions.logout();
    expect(await actions.signIn('newlawyer', 'newlawyer-1234')).toEqual({ ok: true });
    expect(me().nickname).toBe('정변호');
  });
});
