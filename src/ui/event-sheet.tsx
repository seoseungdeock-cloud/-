// 캘린더 일정 만들기·고치기·보기 시트 (회의실 예약, 참석자 초대, 반복)
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { kstDate, kstIso, kstTime, resourceConflicts, work, type EventInput, type EventScope, type Recurrence, type WorkEvent } from '@/core/work';
import { useWork } from '@/core/work';
import { Sheet } from '@/ui/chat';
import { Icon } from '@/ui/icons';
import { Avatar, Badge, Button, Chip, Chips, Input, Notice, Sub, T } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';
import { useLayout } from '@/ui/web-frame';
import { timeLabel } from '@/ui/hearing';

const SCOPES: [EventScope, string][] = [['personal', '내 일정'], ['dept', '부서 공유'], ['firm', '회사 공유'], ['room', '대화방']];
const REPEATS: [Recurrence, string][] = [['none', '반복 없음'], ['daily', '매일'], ['weekly', '매주'], ['monthly', '매월']];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 'HH:MM' 에 분을 더함 (하루 안에서) */
function addMinutes(time: string, min: number): string {
  const [h, m] = time.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + min));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 일정 만들기 / 고치기 */
export function EventEditor({ open, onClose, initial, date, roomId, onDone }: { open: boolean; onClose: () => void; initial?: WorkEvent; date?: string; roomId?: string; onDone?: (id: string) => void }) {
  const c = useColors();
  const { desktop } = useLayout();
  const s = useApp();
  const me = useMe();
  const w = useWork();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const todayStr = kstDate(new Date().toISOString());
  const [day, setDay] = useState(initial ? kstDate(initial.startsAt) : date ?? todayStr);
  const [start, setStart] = useState(initial ? kstTime(initial.startsAt) : '10:00');
  const [end, setEnd] = useState(initial ? kstTime(initial.endsAt) : '11:00');
  const [place, setPlace] = useState(initial?.place ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [scope, setScope] = useState<EventScope>(initial?.scope ?? (roomId ? 'room' : 'personal'));
  const [room, setRoom] = useState<string | undefined>(initial?.roomId ?? roomId);
  const [resource, setResource] = useState<string | undefined>(initial?.resourceId);
  const [repeat, setRepeat] = useState<Recurrence>(initial?.recurrence ?? 'none');
  const [until, setUntil] = useState(initial?.recurrenceUntil ?? '');
  const [attendees, setAttendees] = useState<string[]>(() => (initial ? w.attendees.filter((a) => a.eventId === initial.id).map((a) => a.userId) : []));
  const [who, setWho] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const firmPeople = useMemo(() => s.users.filter((u) => u.id !== me.id && u.role !== 'client' && u.firm === me.firm), [s.users, me]);
  const hits = who.trim() ? firmPeople.filter((u) => [u.nickname, u.dept, u.title].some((v) => v?.includes(who.trim()))).slice(0, 6) : [];
  const myRooms = s.rooms.filter((r) => r.memberIds.includes(me.id) && r.kind !== 'direct');
  const validTimes = DATE_RE.test(day) && (allDay || (TIME_RE.test(start) && TIME_RE.test(end)));
  const startsAt = validTimes ? kstIso(day, allDay ? '00:00' : start) : undefined;
  const endsAt = validTimes ? kstIso(day, allDay ? '23:59' : end) : undefined;
  const conflicts = resource && startsAt && endsAt ? resourceConflicts(w.events, resource, startsAt, endsAt, initial?.id) : [];
  const rooms = w.resources.filter((r) => r.active && r.kind === 'room');

  const submit = async () => {
    if (!title.trim()) return setError('제목을 적어 주세요.');
    if (!DATE_RE.test(day)) return setError('날짜는 2026-11-20 처럼 적어 주세요.');
    if (!allDay && (!TIME_RE.test(start) || !TIME_RE.test(end))) return setError('시각은 09:30 처럼 적어 주세요.');
    if (!allDay && end <= start) return setError('끝나는 시각이 시작보다 늦어야 합니다.');
    if (scope === 'room' && !room) return setError('대화방을 골라 주세요.');
    if (scope === 'dept' && !me.dept) return setError('내 부서 정보가 없어 부서 공유를 쓸 수 없습니다.');
    if (repeat !== 'none' && until && !DATE_RE.test(until)) return setError('반복 종료일은 2026-12-31 처럼 적어 주세요.');
    if (conflicts.length) return setError(`그 시간에 이미 예약된 회의실입니다: ${conflicts[0].title}`);
    setBusy(true);
    setError(undefined);
    const input: EventInput = {
      title, allDay, startsAt: startsAt!, endsAt: endsAt!, place: place.trim() || undefined, memo: memo.trim() || undefined,
      scope, dept: scope === 'dept' ? me.dept : undefined, roomId: scope === 'room' ? room : undefined, resourceId: resource,
      recurrence: repeat, recurrenceUntil: repeat !== 'none' && until ? until : undefined, attendeeIds: attendees,
    };
    const r = initial ? await work.updateEvent(initial.id, input) : await work.createEvent(input);
    setBusy(false);
    if (!r.ok) return setError(r.reason);
    onDone?.(initial?.id ?? (r as { id?: string }).id ?? '');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <T size="h3" bold>{initial ? '일정 고치기' : '새 일정'}</T>
      {/* 제목·단추는 고정, 가운데 항목만 스크롤 */}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1, marginTop: space.sm }}>
        <Input placeholder="제목" value={title} onChangeText={setTitle} autoFocus />
        <Chips>
          <Chip label="종일" active={allDay} onPress={() => setAllDay((v) => !v)} />
          <Chip label="오늘" active={day === todayStr} onPress={() => setDay(todayStr)} />
          <Chip label="내일" onPress={() => setDay(new Date(new Date(`${todayStr}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10))} />
        </Chips>
        {/* PC: 날짜·시작·끝 한 줄 / 폰: 날짜 한 줄, 시작·끝 한 줄 */}
        <View style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? space.sm : 0 }}>
          <View style={{ flex: desktop ? 1.3 : undefined }}><Input label="날짜" placeholder="2026-11-20" value={day} onChangeText={setDay} autoCapitalize="none" /></View>
          {allDay ? null : (
            <View style={{ flex: desktop ? 2 : undefined, flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}><Input label="시작" placeholder="10:00" value={start} onChangeText={(v) => { setStart(v); if (TIME_RE.test(v) && end <= v) setEnd(addMinutes(v, 60)); }} autoCapitalize="none" /></View>
              <View style={{ flex: 1 }}><Input label="끝" placeholder="11:00" value={end} onChangeText={setEnd} autoCapitalize="none" /></View>
            </View>
          )}
        </View>
        <Sub>공유 범위</Sub>
        <View style={{ height: 6 }} />
        <Chips>{SCOPES.filter(([k]) => k !== 'dept' || me.dept).map(([k, l]) => <Chip key={k} label={k === 'dept' ? `부서 공유 (${me.dept})` : l} active={scope === k} onPress={() => setScope(k)} />)}</Chips>
        {scope === 'room' ? (
          <Chips>{myRooms.map((r) => <Chip key={r.id} label={r.title} active={room === r.id} onPress={() => setRoom(r.id)} />)}</Chips>
        ) : null}
        {rooms.length ? (
          <>
            <Sub>회의실</Sub>
            <View style={{ height: 6 }} />
            <Chips>
              <Chip label="없음" active={!resource} onPress={() => setResource(undefined)} />
              {rooms.map((r) => <Chip key={r.id} label={`${r.name}${r.capacity ? ` · ${r.capacity}명` : ''}`} active={resource === r.id} onPress={() => { setResource(r.id); if (!place) setPlace(r.name); }} />)}
            </Chips>
            {conflicts.length ? <Notice text={`이미 예약됨: ${conflicts.map((x) => `${x.title} (${kstTime(x.startsAt)}~${kstTime(x.endsAt)})`).join(', ')}`} /> : null}
          </>
        ) : null}
        <Input label="장소" placeholder="장소 (선택)" value={place} onChangeText={setPlace} />
        <Sub>참석자</Sub>
        <View style={{ height: 6 }} />
        {attendees.length ? (
          <Chips>{attendees.map((id) => { const u = s.users.find((x) => x.id === id); return <Chip key={id} label={`${u?.nickname ?? id} ×`} active onPress={() => setAttendees((a) => a.filter((x) => x !== id))} />; })}</Chips>
        ) : null}
        <Input placeholder="이름·부서로 찾아 초대" value={who} onChangeText={setWho} />
        {hits.length ? (
          <View style={{ marginTop: -space.sm, marginBottom: space.md, borderRadius: radius.md, backgroundColor: c.surface, overflow: 'hidden' }}>
            {hits.map((u) => (
              <Pressable key={u.id} onPress={() => { setAttendees((a) => (a.includes(u.id) ? a : [...a, u.id])); setWho(''); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm + 2, backgroundColor: pressed ? c.lineStrong : 'transparent' })}>
                <Avatar name={u.nickname} size={28} uri={u.photo} />
                <Text style={{ ...family.semibold, fontSize: 14, color: c.text }}>{u.nickname}</Text>
                <Text style={{ ...family.regular, fontSize: 12, color: c.sub }}>{[u.title, u.dept].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Sub>반복</Sub>
        <View style={{ height: 6 }} />
        <Chips>{REPEATS.map(([k, l]) => <Chip key={k} label={l} active={repeat === k} onPress={() => setRepeat(k)} />)}</Chips>
        {repeat !== 'none' ? <Input label="반복 종료일 (비우면 계속)" placeholder="2026-12-31" value={until} onChangeText={setUntil} autoCapitalize="none" /> : null}
        <Input placeholder="메모 (선택)" value={memo} onChangeText={setMemo} multiline />
      </ScrollView>
      {error ? <Notice text={error} /> : null}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
        <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={onClose} /></View>
        <View style={{ flex: 2 }}><Button label={busy ? '저장 중…' : initial ? '저장' : '일정 추가'} disabled={busy} onPress={() => void submit()} /></View>
      </View>
    </Sheet>
  );
}

/** 일정 보기 — 참석 응답, 고치기, 지우기 */
export function EventDetail({ event, onClose, onEdit }: { event?: WorkEvent; onClose: () => void; onEdit: (e: WorkEvent) => void }) {
  const s = useApp();
  const me = useMe();
  const w = useWork();
  const [error, setError] = useState<string>();
  if (!event) return null;
  const base = event.id.split('@')[0];
  const owner = s.users.find((u) => u.id === event.ownerId);
  const resource = w.resources.find((r) => r.id === event.resourceId);
  const att = w.attendees.filter((a) => a.eventId === base);
  const mine = att.find((a) => a.userId === me.id);
  const isOwner = event.ownerId === me.id;
  const scopeLabel = SCOPES.find(([k]) => k === event.scope)?.[1];
  const when = event.allDay ? `${kstDate(event.startsAt)} 종일` : `${kstDate(event.startsAt)} ${timeLabel(kstTime(event.startsAt))} ~ ${timeLabel(kstTime(event.endsAt))}`;
  const act = async (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    const r = await fn();
    if (!r.ok) setError((r as { reason: string }).reason);
    else onClose();
  };
  return (
    <Sheet open={!!event} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <T size="h3" bold>{event.title}</T>
          <Sub>{when}{event.recurrence !== 'none' ? ` · ${REPEATS.find(([k]) => k === event.recurrence)?.[1]}` : ''}</Sub>
        </View>
        <Badge label={scopeLabel ?? ''} tone="plain" />
      </View>
      <View style={{ gap: 6, marginTop: space.sm }}>
        {resource ? <Line icon="map" text={`회의실 · ${resource.name}${resource.capacity ? ` (${resource.capacity}명)` : ''}`} /> : event.place ? <Line icon="map" text={event.place} /> : null}
        <Line icon="me" text={`만든 사람 · ${owner?.nickname ?? ''}`} />
        {event.memo ? <Line icon="board" text={event.memo} /> : null}
      </View>
      {att.length ? (
        <View style={{ marginTop: space.md }}>
          <Sub>참석자 {att.length}명 · 참석 {att.filter((a) => a.status === 'accepted').length} · 불참 {att.filter((a) => a.status === 'declined').length}</Sub>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {att.map((a) => {
              const u = s.users.find((x) => x.id === a.userId);
              const tone = a.status === 'accepted' ? 'secure' : a.status === 'declined' ? 'warn' : 'plain';
              return <Badge key={a.userId} label={`${u?.nickname ?? a.userId} · ${a.status === 'accepted' ? '참석' : a.status === 'declined' ? '불참' : '미정'}`} tone={tone} />;
            })}
          </View>
        </View>
      ) : null}
      {error ? <Notice text={error} /> : null}
      {mine ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <View style={{ flex: 1 }}><Button label={mine.status === 'accepted' ? '참석 ✓' : '참석'} kind={mine.status === 'accepted' ? 'primary' : 'plain'} onPress={() => void act(() => work.respond(base, 'accepted'))} /></View>
          <View style={{ flex: 1 }}><Button label={mine.status === 'declined' ? '불참 ✓' : '불참'} kind={mine.status === 'declined' ? 'dark' : 'plain'} onPress={() => void act(() => work.respond(base, 'declined'))} /></View>
        </View>
      ) : null}
      {isOwner ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <View style={{ flex: 1 }}><Button label="지우기" kind="plain" onPress={() => void act(() => work.deleteEvent(base))} /></View>
          <View style={{ flex: 2 }}><Button label="고치기" onPress={() => { const e = w.events.find((x) => x.id === base); if (e) onEdit(e); }} /></View>
        </View>
      ) : null}
    </Sheet>
  );
}

function Line({ icon, text }: { icon: 'map' | 'me' | 'board'; text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      <Icon name={icon} color={c.faint} size={16} />
      <Text style={{ flex: 1, ...family.regular, fontSize: 14, color: c.sub, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}
