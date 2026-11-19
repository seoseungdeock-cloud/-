import { _setWorkState, dueState, kstDate, kstIso, kstTime, occurrences, resourceConflicts, sortTasks, visibleEvents, work, workState, type Task, type WorkEvent } from '../work';

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
