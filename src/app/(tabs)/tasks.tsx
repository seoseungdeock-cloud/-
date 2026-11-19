// 할 일 — 내 할 일 / 내가 맡긴 일 / 완료. 담당자·기한·중요도, 대화방 연결.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { todayKst } from '@/core/calendar';
import { dateLabel, dDay, dDayLabel } from '@/core/hearings';
import { dueState, sortTasks, useWork, work, type Task } from '@/core/work';
import { Sheet } from '@/ui/chat';
import { Icon } from '@/ui/icons';
import { Avatar, Button, Chip, Chips, Empty, Input, Notice, Screen, Sub, T } from '@/ui/kit';
import { Appear, Fade, Press } from '@/ui/motion';
import { SegmentBar } from '@/ui/segments';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type View_ = 'mine' | 'delegated' | 'done';
const PRIORITY: [0 | 1 | 2, string][] = [[0, '보통'], [1, '중요'], [2, '긴급']];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function TasksScreen() {
  const w = useWork();
  const me = useMe();
  const c = useColors();
  const today = todayKst();
  const [view, setView] = useState<View_>('mine');
  const [editor, setEditor] = useState<{ open: boolean; initial?: Task }>({ open: false });
  const list = useMemo(() => {
    const all = sortTasks(w.tasks);
    if (view === 'done') return all.filter((t) => t.doneAt && (t.ownerId === me.id || t.assigneeId === me.id));
    if (view === 'delegated') return all.filter((t) => !t.doneAt && t.ownerId === me.id && t.assigneeId && t.assigneeId !== me.id);
    return all.filter((t) => !t.doneAt && (t.assigneeId === me.id || (!t.assigneeId && t.ownerId === me.id)));
  }, [w.tasks, view, me.id]);
  const counts = {
    mine: w.tasks.filter((t) => !t.doneAt && (t.assigneeId === me.id || (!t.assigneeId && t.ownerId === me.id))).length,
    overdue: w.tasks.filter((t) => t.assigneeId === me.id && dueState(t, today) === 'overdue').length,
  };
  const groups = useMemo(() => {
    const g: [string, Task[]][] = [];
    for (const t of list) {
      const st = dueState(t, today);
      const key = view === 'done' ? '완료' : st === 'overdue' ? '기한 지남' : st === 'today' ? '오늘' : st === 'soon' ? '이번 주' : st === 'later' ? '나중에' : '기한 없음';
      const last = g[g.length - 1];
      if (last && last[0] === key) last[1].push(t); else g.push([key, [t]]);
    }
    return g;
  }, [list, today, view]);
  return (
    <Screen
      title="할 일"
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <SegmentBar items={[['mine', `내 할 일${counts.mine ? ` ${counts.mine}` : ''}`], ['delegated', '맡긴 일'], ['done', '완료']]} value={view} onChange={setView} />
          <Button small label="추가" icon="plus" onPress={() => setEditor({ open: true })} />
        </View>
      }>
      {editor.open ? <TaskEditor onClose={() => setEditor({ open: false })} initial={editor.initial} /> : null}
      {counts.overdue && view === 'mine' ? <Notice text={`기한이 지난 할 일이 ${counts.overdue}개 있습니다.`} /> : null}
      <Fade key={view}>
        {groups.length ? (
          groups.map(([label, items]) => (
            <View key={label} style={{ marginBottom: space.md }}>
              <Text style={{ ...family.semibold, fontSize: 13, color: label === '기한 지남' ? c.warn : c.sub, marginBottom: 6, marginTop: space.sm }}>{label} · {items.length}</Text>
              {items.map((t, i) => (
                <Appear key={t.id} index={i}>
                  <TaskRow t={t} today={today} onOpen={() => setEditor({ open: true, initial: t })} />
                </Appear>
              ))}
            </View>
          ))
        ) : (
          <Empty text={view === 'done' ? '완료한 할 일이 없습니다.' : view === 'delegated' ? '다른 사람에게 맡긴 일이 없습니다.' : '할 일이 없습니다.'} hint={view === 'mine' ? '「추가」로 할 일을 적고 기한과 담당자를 정해 보세요.' : undefined} />
        )}
      </Fade>
    </Screen>
  );
}

function TaskRow({ t, today, onOpen }: { t: Task; today: string; onOpen: () => void }) {
  const c = useColors();
  const s = useApp();
  const me = useMe();
  const st = dueState(t, today);
  const assignee = s.users.find((u) => u.id === t.assigneeId);
  const owner = s.users.find((u) => u.id === t.ownerId);
  const room = t.roomId ? s.rooms.find((r) => r.id === t.roomId) : undefined;
  const dueColor = st === 'overdue' ? c.warn : st === 'today' ? c.accent : c.sub;
  const sub = [
    t.dueDate ? `${dateLabel(t.dueDate)}${t.dueTime ? ` ${t.dueTime}` : ''}${!t.doneAt && st !== 'none' ? ` (${dDayLabel(dDay(t.dueDate))})` : ''}` : '',
    t.assigneeId !== me.id && assignee ? `담당 ${assignee.nickname}` : t.ownerId !== me.id && owner ? `${owner.nickname} 님이 맡김` : '',
    room ? room.title : '',
  ].filter(Boolean).join(' · ');
  return (
    <Press onPress={onOpen} scale={0.99} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, paddingHorizontal: space.md, marginHorizontal: -space.md, borderRadius: radius.md, backgroundColor: hovered ? c.hover : 'transparent' })}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!t.doneAt }} accessibilityLabel={t.doneAt ? '완료 취소' : '완료'} hitSlop={8} onPress={() => void work.toggleTask(t.id)}
        style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: t.doneAt ? c.accent : t.priority === 2 ? c.warn : c.mute, backgroundColor: t.doneAt ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {t.doneAt ? <Icon name="check" color="#FFFFFF" size={14} /> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {t.priority === 2 && !t.doneAt ? <View style={{ paddingHorizontal: 6, borderRadius: 4, backgroundColor: c.warnSoft }}><Text style={{ ...family.bold, fontSize: 10, color: c.warn }}>긴급</Text></View> : null}
          {t.priority === 1 && !t.doneAt ? <View style={{ paddingHorizontal: 6, borderRadius: 4, backgroundColor: c.accentSoft }}><Text style={{ ...family.bold, fontSize: 10, color: c.accent }}>중요</Text></View> : null}
          <Text numberOfLines={1} style={{ flex: 1, ...family.semibold, fontSize: 15, color: t.doneAt ? c.faint : c.text, textDecorationLine: t.doneAt ? 'line-through' : 'none' }}>{t.title}</Text>
        </View>
        {sub ? <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12.5, color: t.doneAt ? c.faint : dueColor }}>{sub}</Text> : null}
      </View>
      {assignee && assignee.id !== me.id ? <Avatar name={assignee.nickname} size={26} uri={assignee.photo} /> : null}
    </Press>
  );
}

/** 할 일 만들기 / 고치기 */
function TaskEditor({ onClose, initial }: { onClose: () => void; initial?: Task }) {
  const c = useColors();
  const s = useApp();
  const me = useMe();
  const today = todayKst();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [due, setDue] = useState(initial?.dueDate ?? '');
  const [time, setTime] = useState(initial?.dueTime ?? '');
  const [priority, setPriority] = useState<0 | 1 | 2>(initial?.priority ?? 0);
  const [assignee, setAssignee] = useState<string>(initial?.assigneeId ?? me.id);
  const [roomId, setRoomId] = useState<string | undefined>(initial?.roomId);
  const [who, setWho] = useState('');
  const [error, setError] = useState<string>();
  const people = s.users.filter((u) => u.role !== 'client' && u.firm === me.firm);
  const hits = who.trim() ? people.filter((u) => u.id !== assignee && [u.nickname, u.dept, u.title].some((v) => v?.includes(who.trim()))).slice(0, 6) : [];
  const picked = s.users.find((u) => u.id === assignee);
  const rooms = s.rooms.filter((r) => r.memberIds.includes(me.id) && (r.kind === 'case' || r.kind === 'group' || r.kind === 'office'));
  const plusDays = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const canDelete = initial && initial.ownerId === me.id;
  const submit = async () => {
    if (!title.trim()) return setError('할 일을 적어 주세요.');
    if (due && !DATE_RE.test(due)) return setError('기한은 2026-11-20 처럼 적어 주세요.');
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setError('시각은 15:00 처럼 적어 주세요.');
    const patch = { title, detail: detail.trim() || undefined, dueDate: due || undefined, dueTime: time || undefined, priority, assigneeId: assignee, roomId };
    const r = initial ? await work.updateTask(initial.id, patch) : await work.createTask(patch);
    if (!r.ok) return setError(r.reason);
    onClose();
  };
  return (
    <Sheet open onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <T size="h3" bold>{initial ? '할 일 고치기' : '새 할 일'}</T>
        <View style={{ height: space.md }} />
        <Input placeholder="무엇을 해야 하나요?" value={title} onChangeText={setTitle} autoFocus />
        <Input placeholder="자세한 내용 (선택)" value={detail} onChangeText={setDetail} multiline />
        <Sub>기한</Sub>
        <View style={{ height: 6 }} />
        <Chips>
          <Chip label="오늘" active={due === today} onPress={() => setDue(today)} />
          <Chip label="내일" active={due === plusDays(1)} onPress={() => setDue(plusDays(1))} />
          <Chip label="다음 주" active={due === plusDays(7)} onPress={() => setDue(plusDays(7))} />
          <Chip label="없음" active={!due} onPress={() => { setDue(''); setTime(''); }} />
        </Chips>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1.4 }}><Input placeholder="2026-11-20" value={due} onChangeText={setDue} autoCapitalize="none" /></View>
          <View style={{ flex: 1 }}><Input placeholder="시각 (선택)" value={time} onChangeText={setTime} autoCapitalize="none" /></View>
        </View>
        <Sub>중요도</Sub>
        <View style={{ height: 6 }} />
        <Chips>{PRIORITY.map(([k, l]) => <Chip key={k} label={l} active={priority === k} onPress={() => setPriority(k)} />)}</Chips>
        <Sub>담당자</Sub>
        <View style={{ height: 6 }} />
        <Chips>
          <Chip label={picked ? `${picked.nickname}${picked.id === me.id ? ' (나)' : ''}` : '나'} active onPress={() => setAssignee(me.id)} />
          {picked && picked.id !== me.id ? <Chip label="나로" onPress={() => setAssignee(me.id)} /> : null}
        </Chips>
        <Input placeholder="다른 사람에게 맡기기 — 이름·부서로 찾기" value={who} onChangeText={setWho} />
        {hits.length ? (
          <View style={{ marginTop: -space.sm, marginBottom: space.md, borderRadius: radius.md, backgroundColor: c.surface, overflow: 'hidden' }}>
            {hits.map((u) => (
              <Pressable key={u.id} onPress={() => { setAssignee(u.id); setWho(''); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm + 2, backgroundColor: pressed ? c.lineStrong : 'transparent' })}>
                <Avatar name={u.nickname} size={28} uri={u.photo} />
                <Text style={{ ...family.semibold, fontSize: 14, color: c.text }}>{u.nickname}</Text>
                <Text style={{ ...family.regular, fontSize: 12, color: c.sub }}>{[u.title, u.dept].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {rooms.length ? (
          <>
            <Sub>관련 대화방 (선택)</Sub>
            <View style={{ height: 6 }} />
            <Chips>
              <Chip label="없음" active={!roomId} onPress={() => setRoomId(undefined)} />
              {rooms.slice(0, 12).map((r) => <Chip key={r.id} label={r.caseInfo?.title ?? r.title} active={roomId === r.id} onPress={() => setRoomId(r.id)} />)}
            </Chips>
          </>
        ) : null}
        {error ? <Notice text={error} /> : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {canDelete ? <View style={{ flex: 1 }}><Button label="지우기" kind="plain" onPress={() => void work.deleteTask(initial!.id).then(onClose)} /></View> : <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={onClose} /></View>}
          <View style={{ flex: 2 }}><Button label={initial ? '저장' : '추가'} onPress={() => void submit()} /></View>
        </View>
        {initial?.roomId ? <View style={{ marginTop: space.sm }}><Button label="대화방 열기" kind="ghost" onPress={() => { onClose(); router.push({ pathname: '/room/[id]', params: { id: initial.roomId! } }); }} /></View> : null}
      </ScrollView>
    </Sheet>
  );
}
