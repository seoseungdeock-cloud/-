// 노트 — 부서·회사·대화방이 함께 보는 메모 (당직표·운영 원칙·사건 쟁점 정리). 고정(공지)하거나 함께 편집할 수 있습니다.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { timeAgo } from '@/core/board';
import { useWork, visibleNotes, work, type SharedNote } from '@/core/work';
import { Sheet } from '@/ui/chat';
import { Icon } from '@/ui/icons';
import { Badge, Button, Chip, Chips, Empty, Input, Notice, Screen, Sub, T } from '@/ui/kit';
import { Appear, Fade, Press } from '@/ui/motion';
import { SegmentBar } from '@/ui/segments';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type Filter = 'all' | 'dept' | 'firm' | 'room';
const SCOPE_LABEL = { dept: '부서', firm: '회사', room: '대화방' } as const;

export default function NotesScreen() {
  const { room } = useLocalSearchParams<{ room?: string }>();
  const w = useWork();
  const s = useApp();
  const me = useMe();
  const c = useColors();
  const [filter, setFilter] = useState<Filter>(room ? 'room' : 'all');
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState<{ open: boolean; initial?: SharedNote }>({ open: false });
  const [reading, setReading] = useState<SharedNote>();
  const notes = useMemo(() => {
    const myRooms = new Set(s.rooms.filter((r) => r.memberIds.includes(me.id)).map((r) => r.id));
    const vis = visibleNotes(w.notes, { id: me.id, dept: me.dept, firm: me.role !== 'client' }, myRooms);
    const k = q.trim();
    return vis.filter((n) => (filter === 'all' || n.scope === filter) && (!room || n.roomId === room) && (!k || n.title.includes(k) || n.body.includes(k)));
  }, [w.notes, s.rooms, me, filter, q, room]);
  const roomTitle = (id?: string) => s.rooms.find((r) => r.id === id)?.title;
  return (
    <Screen
      title="노트"
      back
      right={<Button small label="새 노트" icon="plus" onPress={() => setEditor({ open: true })} />}>
      {editor.open ? <NoteEditor initial={editor.initial} roomId={room} onClose={() => setEditor({ open: false })} /> : null}
      {reading ? (
        <Sheet open onClose={() => setReading(undefined)}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <T size="h3" bold>{reading.title}</T>
              <Sub>{SCOPE_LABEL[reading.scope]}{reading.scope === 'dept' ? ` · ${reading.dept}` : reading.scope === 'room' ? ` · ${roomTitle(reading.roomId) ?? ''}` : ''} · {s.users.find((u) => u.id === reading.authorId)?.nickname ?? ''} · {timeAgo(reading.updatedAt)} 수정</Sub>
            </View>
            {reading.pinned ? <Badge label="고정" /> : null}
          </View>
          <ScrollView style={{ maxHeight: 420, marginTop: space.md }}>
            <Text selectable style={{ ...family.regular, fontSize: 15, lineHeight: 24, color: c.text }}>{reading.body || '(내용 없음)'}</Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            {reading.authorId === me.id ? <View style={{ flex: 1 }}><Button label="지우기" kind="plain" onPress={() => void work.deleteNote(reading.id).then(() => setReading(undefined))} /></View> : null}
            {reading.authorId === me.id || reading.allowEdit ? <View style={{ flex: 2 }}><Button label="고치기" onPress={() => { setEditor({ open: true, initial: reading }); setReading(undefined); }} /></View> : <View style={{ flex: 2 }}><Button label="닫기" kind="plain" onPress={() => setReading(undefined)} /></View>}
          </View>
        </Sheet>
      ) : null}
      <View style={{ gap: space.sm, marginBottom: space.md }}>
        <SegmentBar items={[['all', '전체'], ['dept', '부서'], ['firm', '회사'], ['room', '대화방']]} value={filter} onChange={setFilter} />
        <Input placeholder="노트 검색" value={q} onChangeText={setQ} />
      </View>
      <Fade key={`${filter}-${q}`}>
        {notes.length ? notes.map((n, i) => (
          <Appear key={n.id} index={i}>
            <Press onPress={() => setReading(n)} scale={0.985} style={({ hovered }) => ({ padding: space.lg, marginBottom: space.sm, borderRadius: radius.lg, backgroundColor: hovered ? c.lineStrong : c.surface, borderLeftWidth: n.pinned ? 3 : 0, borderLeftColor: c.accent })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {n.pinned ? <Icon name="pin" color={c.accent} size={14} /> : null}
                <Text numberOfLines={1} style={{ flex: 1, ...family.semibold, fontSize: 15, color: c.text }}>{n.title}</Text>
                <Badge label={n.scope === 'dept' ? n.dept ?? '부서' : n.scope === 'room' ? roomTitle(n.roomId) ?? '대화방' : '회사'} tone="plain" />
              </View>
              <Text numberOfLines={2} style={{ ...family.regular, fontSize: 13.5, lineHeight: 20, color: c.sub, marginTop: 4 }}>{n.body}</Text>
              <Text style={{ ...family.regular, fontSize: 12, color: c.faint, marginTop: 6 }}>{s.users.find((u) => u.id === n.authorId)?.nickname ?? ''} · {timeAgo(n.updatedAt)}{n.allowEdit ? ' · 함께 편집' : ''}</Text>
            </Press>
          </Appear>
        )) : <Empty text={q ? '검색 결과가 없습니다.' : '노트가 없습니다.'} hint="당직표, 운영 원칙, 사건 쟁점 정리처럼 같이 봐야 하는 메모를 남겨 두세요." />}
      </Fade>
    </Screen>
  );
}

function NoteEditor({ initial, roomId, onClose }: { initial?: SharedNote; roomId?: string; onClose: () => void }) {
  const s = useApp();
  const me = useMe();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [scope, setScope] = useState<SharedNote['scope']>(initial?.scope ?? (roomId ? 'room' : me.dept ? 'dept' : 'firm'));
  const [room, setRoom] = useState<string | undefined>(initial?.roomId ?? roomId);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [allowEdit, setAllowEdit] = useState(initial?.allowEdit ?? true);
  const [error, setError] = useState<string>();
  const myRooms = s.rooms.filter((r) => r.memberIds.includes(me.id) && r.kind !== 'direct');
  const isAuthor = !initial || initial.authorId === me.id;
  const submit = async () => {
    const r = await work.saveNote({ id: initial?.id, title, body, scope, dept: scope === 'dept' ? (initial?.dept ?? me.dept) : undefined, roomId: scope === 'room' ? room : undefined, pinned, allowEdit });
    if (!r.ok) return setError(r.reason);
    onClose();
  };
  return (
    <Sheet open onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <T size="h3" bold>{initial ? '노트 고치기' : '새 노트'}</T>
        <View style={{ height: space.md }} />
        <Input placeholder="제목" value={title} onChangeText={setTitle} autoFocus />
        <Input placeholder="내용" value={body} onChangeText={setBody} multiline style={{ minHeight: 180 }} />
        {isAuthor ? (
          <>
            <Sub>누가 보나</Sub>
            <View style={{ height: 6 }} />
            <Chips>
              {me.dept ? <Chip label={`부서 (${me.dept})`} active={scope === 'dept'} onPress={() => setScope('dept')} /> : null}
              <Chip label="회사 전체" active={scope === 'firm'} onPress={() => setScope('firm')} />
              <Chip label="대화방" active={scope === 'room'} onPress={() => setScope('room')} />
            </Chips>
            {scope === 'room' ? <Chips>{myRooms.map((r) => <Chip key={r.id} label={r.title} active={room === r.id} onPress={() => setRoom(r.id)} />)}</Chips> : null}
            <Chips>
              <Chip label={pinned ? '고정 ✓' : '위에 고정'} active={pinned} onPress={() => setPinned((v) => !v)} />
              <Chip label={allowEdit ? '함께 편집 ✓' : '나만 편집'} active={allowEdit} onPress={() => setAllowEdit((v) => !v)} />
            </Chips>
          </>
        ) : null}
        {error ? <Notice text={error} /> : null}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}><Button label="취소" kind="plain" onPress={onClose} /></View>
          <View style={{ flex: 2 }}><Button label={initial ? '저장' : '만들기'} onPress={() => void submit()} /></View>
        </View>
      </ScrollView>
    </Sheet>
  );
}

export function openNotes(roomId?: string) {
  router.push(roomId ? { pathname: '/notes', params: { room: roomId } } : '/notes');
}
