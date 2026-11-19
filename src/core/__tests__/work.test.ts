import { _setWorkState, cleanFolder, dueState, folderView, visibleFiles, type DriveFile, kstDate, kstIso, kstTime, occurrences, resourceConflicts, searchContacts, sortTasks, visibleEvents, visibleNotes, work, workState, type Task, type WorkEvent } from '../work';

const ev = (p: Partial<WorkEvent> & Pick<WorkEvent, 'id' | 'startsAt' | 'endsAt'>): WorkEvent => ({
  ownerId: 'u1', title: p.id, allDay: false, scope: 'personal', recurrence: 'none', createdAt: '2026-01-01T00:00:00Z', ...p,
});

describe('캘린더 일정 규칙', () => {
  it('한국 시간 날짜·시각 변환', () => {
    const iso = kstIso('2026-11-20', '09:30');
    expect(kstDate(iso)).toBe('2026-11-20');
    expect(kstTime(iso)).toBe('09:30');
    // 자정 직후도 한국 날짜로
    expect(kstDate('2026-11-19T16:00:00Z')).toBe('2026-11-20');
  });
  it('반복 일정을 범위 안의 회차로 펼친다 (주간·월간·종료일)', () => {
    const weekly = ev({ id: 'w', startsAt: kstIso('2026-11-02', '09:00'), endsAt: kstIso('2026-11-02', '10:00'), recurrence: 'weekly' });
    const nov = occurrences(weekly, '2026-11-01', '2026-11-30');
    expect(nov.map((o) => kstDate(o.startsAt))).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(nov[0].id).toBe('w');
    expect(nov[1].id).toBe('w@2026-11-09');
    expect(kstTime(nov[4].endsAt)).toBe('10:00');
    const monthly = ev({ id: 'm', startsAt: kstIso('2026-01-31', '14:00'), endsAt: kstIso('2026-01-31', '15:00'), recurrence: 'monthly', recurrenceUntil: '2026-03-15' });
    expect(occurrences(monthly, '2026-01-01', '2026-12-31').map((o) => kstDate(o.startsAt))).toEqual(['2026-01-31', '2026-02-28']);
    expect(occurrences(ev({ id: 'x', startsAt: kstIso('2026-05-05'), endsAt: kstIso('2026-05-05', '23:59') }), '2026-06-01', '2026-06-30')).toEqual([]);
  });
  it('회의실 겹침: 같은 회의실·시간이 겹칠 때만, 반복 회차도 본다', () => {
    const events = [
      ev({ id: 'a', resourceId: 'r1', startsAt: kstIso('2026-11-20', '09:00'), endsAt: kstIso('2026-11-20', '10:00'), recurrence: 'weekly' }),
      ev({ id: 'b', resourceId: 'r2', startsAt: kstIso('2026-11-20', '09:00'), endsAt: kstIso('2026-11-20', '10:00') }),
    ];
    expect(resourceConflicts(events, 'r1', kstIso('2026-11-20', '09:30'), kstIso('2026-11-20', '11:00')).map((e) => e.id)).toEqual(['a']);
    expect(resourceConflicts(events, 'r1', kstIso('2026-11-27', '09:30'), kstIso('2026-11-27', '09:45')).map((e) => e.id)).toEqual(['a@2026-11-27']);
    expect(resourceConflicts(events, 'r1', kstIso('2026-11-20', '10:00'), kstIso('2026-11-20', '11:00'))).toEqual([]); // 끝나는 시각에 바로 이어 쓰기는 됨
    expect(resourceConflicts(events, 'r1', kstIso('2026-11-20', '09:00'), kstIso('2026-11-20', '10:00'), 'a')).toEqual([]); // 자기 자신은 제외
  });
  it('보이는 일정: 내 것·초대·부서·회사·내 대화방', () => {
    const s = {
      events: [
        ev({ id: 'mine', ownerId: 'me', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
        ev({ id: 'invited', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
        ev({ id: 'dept-ok', scope: 'dept', dept: '부산', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
        ev({ id: 'dept-no', scope: 'dept', dept: '서울', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
        ev({ id: 'firm', scope: 'firm', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
        ev({ id: 'room-ok', scope: 'room', roomId: 'r1', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
        ev({ id: 'room-no', scope: 'room', roomId: 'r9', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
        ev({ id: 'other', startsAt: '2026-11-20T00:00:00Z', endsAt: '2026-11-20T01:00:00Z' }),
      ],
      attendees: [{ eventId: 'invited', userId: 'me', status: 'pending' as const }],
    };
    expect(visibleEvents(s, { id: 'me', dept: '부산', firm: true }, new Set(['r1'])).map((e) => e.id)).toEqual(['mine', 'invited', 'dept-ok', 'firm', 'room-ok']);
    // 의뢰인(firm 아님)은 회사·부서 일정을 못 봄
    expect(visibleEvents(s, { id: 'me', firm: false }, new Set()).map((e) => e.id)).toEqual(['mine', 'invited']);
  });
});

describe('할 일 규칙', () => {
  const t = (p: Partial<Task> & Pick<Task, 'id'>): Task => ({ ownerId: 'me', title: p.id, priority: 0, createdAt: '2026-01-01T00:00:00Z', ...p });
  it('정렬: 미완료(기한순, 같은 날 긴급 먼저, 기한 없음 뒤) → 완료(최근 먼저)', () => {
    const list = [
      t({ id: 'done-old', doneAt: '2026-11-01T00:00:00Z' }),
      t({ id: 'nodue' }),
      t({ id: 'later', dueDate: '2026-11-25' }),
      t({ id: 'today-normal', dueDate: '2026-11-20', priority: 0 }),
      t({ id: 'today-urgent', dueDate: '2026-11-20', priority: 2 }),
      t({ id: 'done-new', doneAt: '2026-11-19T00:00:00Z' }),
    ];
    expect(sortTasks(list).map((x) => x.id)).toEqual(['today-urgent', 'today-normal', 'later', 'nodue', 'done-new', 'done-old']);
  });
  it('기한 상태', () => {
    expect(dueState(t({ id: 'a', dueDate: '2026-11-19' }), '2026-11-20')).toBe('overdue');
    expect(dueState(t({ id: 'b', dueDate: '2026-11-20' }), '2026-11-20')).toBe('today');
    expect(dueState(t({ id: 'c', dueDate: '2026-11-22' }), '2026-11-20')).toBe('soon');
    expect(dueState(t({ id: 'd', dueDate: '2026-12-20' }), '2026-11-20')).toBe('later');
    expect(dueState(t({ id: 'e', dueDate: '2026-11-19', doneAt: 'x' }), '2026-11-20')).toBe('none');
    expect(dueState(t({ id: 'f' }), '2026-11-20')).toBe('none');
  });
});

describe('업무 동작 (목업)', () => {
  beforeEach(() => _setWorkState({ resources: [{ id: 'r1', name: '회의실', kind: 'room', active: true }] }, 'me'));
  it('일정 만들기·회의실 겹침 거부·참석 응답·삭제 권한', async () => {
    const a = await work.createEvent({ title: '회의', startsAt: kstIso('2026-11-20', '09:00'), endsAt: kstIso('2026-11-20', '10:00'), allDay: false, scope: 'personal', recurrence: 'none', resourceId: 'r1', attendeeIds: ['u2', 'me'] });
    expect(a.ok).toBe(true);
    expect(workState().attendees).toEqual([{ eventId: a.id, userId: 'u2', status: 'pending' }]); // 나는 참석자 목록에 안 들어감
    const b = await work.createEvent({ title: '겹침', startsAt: kstIso('2026-11-20', '09:30'), endsAt: kstIso('2026-11-20', '11:00'), allDay: false, scope: 'personal', recurrence: 'none', resourceId: 'r1' });
    expect(b).toEqual({ ok: false, reason: '그 시간에 이미 예약된 회의실입니다.' });
    expect((await work.createEvent({ title: '  ', startsAt: 'x', endsAt: 'x', allDay: true, scope: 'personal', recurrence: 'none' })).ok).toBe(false);
    expect((await work.respond(a.id!, 'accepted')).ok).toBe(false); // 초대받지 않은 사람(주인)은 응답 못 함
    _setWorkState({ events: workState().events, attendees: workState().attendees }, 'u2');
    expect((await work.respond(a.id!, 'accepted')).ok).toBe(true);
    expect(workState().attendees[0].status).toBe('accepted');
    expect((await work.deleteEvent(a.id!)).ok).toBe(false); // 참석자는 못 지움
  });
  it('할 일 만들기·완료 토글·담당자 수정 권한', async () => {
    const r = await work.createTask({ title: '소장 초안', priority: 1, dueDate: '2026-11-21' });
    expect(r.ok).toBe(true);
    const id = r.id!;
    expect(workState().tasks[0].assigneeId).toBe('me'); // 담당자 비우면 나
    await work.toggleTask(id);
    expect(workState().tasks[0].doneAt).toBeTruthy();
    await work.toggleTask(id);
    expect(workState().tasks[0].doneAt).toBeUndefined();
    _setWorkState({ tasks: workState().tasks }, 'stranger');
    expect((await work.updateTask(id, { title: 'x' })).ok).toBe(false);
    expect((await work.deleteTask(id)).ok).toBe(false);
  });
});

describe('노트·연락처', () => {
  beforeEach(() => _setWorkState({}, 'me'));
  it('노트: 범위·고정 정렬, 편집 권한', async () => {
    const a = await work.saveNote({ title: '부서 당직', body: 'x', scope: 'dept', dept: '부산', pinned: false, allowEdit: true });
    const b = await work.saveNote({ title: '회사 원칙', body: 'y', scope: 'firm', pinned: true, allowEdit: false });
    expect(a.ok && b.ok).toBe(true);
    expect((await work.saveNote({ title: '', body: '', scope: 'firm', pinned: false, allowEdit: true })).ok).toBe(false);
    const vis = visibleNotes(workState().notes, { id: 'other', dept: '부산', firm: true }, new Set());
    expect(vis.map((n) => n.title)).toEqual(['회사 원칙', '부서 당직']); // 고정 먼저
    expect(visibleNotes(workState().notes, { id: 'other', dept: '서울', firm: true }, new Set()).map((n) => n.title)).toEqual(['회사 원칙']);
    _setWorkState({ notes: workState().notes }, 'other');
    expect((await work.saveNote({ id: b.id, title: '바꿈', body: '', scope: 'firm', pinned: true, allowEdit: false })).ok).toBe(false); // 나만 편집
    expect((await work.saveNote({ id: a.id, title: '바꿈', body: '', scope: 'dept', dept: '부산', pinned: false, allowEdit: true })).ok).toBe(true); // 함께 편집
    expect((await work.deleteNote(a.id!)).ok).toBe(false); // 글쓴이만 삭제
  });
  it('연락처: 전화나 이메일 중 하나 필수, 태그 정리, 검색', async () => {
    expect((await work.saveContact({ name: '김보험', shared: true, tags: [] })).ok).toBe(false);
    const r = await work.saveContact({ name: '김보험', company: '○○화재', phone: '02-1', shared: true, tags: [' 보험사', '보험사', '', '교통사고'] });
    expect(r.ok).toBe(true);
    expect(workState().contacts[0].tags).toEqual(['보험사', '교통사고']);
    await work.saveContact({ name: '박서기', email: 'a@b.c', shared: false, tags: ['법원'] });
    expect(searchContacts(workState().contacts, '화재').map((c) => c.name)).toEqual(['김보험']);
    expect(searchContacts(workState().contacts, '', '법원').map((c) => c.name)).toEqual(['박서기']);
    expect(searchContacts(workState().contacts, 'A@B').map((c) => c.name)).toEqual(['박서기']);
  });
});

describe('파일함', () => {
  const f = (id: string, p: Partial<DriveFile>): DriveFile => ({ id, scope: 'firm', folder: '', name: `${id}.pdf`, size: 10, path: `${id}/${id}.pdf`, uploaderId: 'u1', createdAt: `2026-11-0${id.length}T00:00:00Z`, ...p });
  it('폴더 이름표를 정리한다', () => {
    expect(cleanFolder(' /서식 / 소송/ ')).toBe('서식/소송');
    expect(cleanFolder('///')).toBe('');
  });
  it('한 폴더 안의 하위 폴더와 파일을 나눈다', () => {
    const files = [f('a', { folder: '' }), f('bb', { folder: '서식' }), f('ccc', { folder: '서식/소송' }), f('dddd', { folder: '서식/계약' }), f('e', { folder: '규정' })];
    const top = folderView(files, '');
    expect(top.folders).toEqual(['규정', '서식']);
    expect(top.files.map((x) => x.id)).toEqual(['a']);
    const form = folderView(files, '서식');
    expect(form.folders).toEqual(['계약', '소송']);
    expect(form.files.map((x) => x.id)).toEqual(['bb']);
  });
  it('보이는 범위: 회사·내 부서·내 방·내가 올린 것', () => {
    const files = [f('a', { scope: 'firm' }), f('b', { scope: 'dept', dept: '송무' }), f('c', { scope: 'dept', dept: '경영' }), f('d', { scope: 'room', roomId: 'r1' }), f('e', { scope: 'room', roomId: 'r2', uploaderId: 'me' })];
    const vis = visibleFiles(files, { id: 'me', dept: '송무', firm: true }, new Set(['r1']));
    expect(vis.map((x) => x.id)).toEqual(['a', 'b', 'd', 'e']);
    expect(visibleFiles(files, { id: 'cl', firm: false }, new Set(['r1'])).map((x) => x.id)).toEqual(['d']);
  });
  it('올리기·옮기기·지우기 (목업)', async () => {
    _setWorkState({ files: [] }, 'me');
    const up = await work.uploadFile({ scope: 'dept', dept: '송무', folder: ' 서식/ ', name: '답변서.docx', uri: 'blob:x', size: 100 });
    expect(up.ok).toBe(true);
    const saved = workState().files[0];
    expect(saved.folder).toBe('서식');
    expect(saved.path.startsWith(`${saved.id}/`)).toBe(true);
    expect((await work.uploadFile({ scope: 'dept', folder: '', name: 'x', uri: 'blob:y' })).ok).toBe(false);
    expect((await work.uploadFile({ scope: 'firm', folder: '', name: 'big', uri: 'blob:z', size: 51 * 1024 * 1024 })).ok).toBe(false);
    expect((await work.moveFile(saved.id, { folder: '서식/소송' })).ok).toBe(true);
    expect(workState().files[0].folder).toBe('서식/소송');
    _setWorkState({ files: workState().files }, 'other');
    expect((await work.deleteFile(saved.id)).ok).toBe(false);
    _setWorkState({ files: workState().files }, 'me');
    expect((await work.deleteFile(saved.id)).ok).toBe(true);
    expect(workState().files).toHaveLength(0);
  });
});
