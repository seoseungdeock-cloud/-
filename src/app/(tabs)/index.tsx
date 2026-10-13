import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { contactsFor } from '@/core/contacts';
import { externalContacts, isHidden, sortRooms, unreadCount, searchDirectory, type DirectoryHit } from '@/core/messenger';
import { actions } from '@/core/store';
import type { Room } from '@/core/types';
import { ContactRow, OrgBrowser, UnderlineTabs } from '@/ui/contacts';
import { Icon } from '@/ui/icons';
import { Avatar, Empty } from '@/ui/kit';
import { roomTitle, RoomRow } from '@/ui/room-row';
import { family, font, MAX_WIDTH, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type RoomFilter = 'all' | 'one' | 'many' | 'case' | 'ai';
const FILTERS: [RoomFilter, string][] = [['all', '전체'], ['one', '1:1'], ['many', '여러 명'], ['case', '사건수행'], ['ai', 'AI']];
const TEST: Record<RoomFilter, (r: Room) => boolean> = {
  all: () => true,
  one: (r) => r.memberIds.length <= 2 && r.kind !== 'meeting' && r.kind !== 'marketing',
  many: (r) => r.memberIds.length > 2,
  case: (r) => r.mode === 'private' && (r.kind === 'case' || r.kind === 'consult'),
  ai: (r) => r.mode === 'ai',
};

// 메신저: 주소록 / 대화방 (네이버웍스 주소록·메시지 구성 참고)
export default function MessengerScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [tab, setTab] = useState<'contacts' | 'rooms'>('contacts');
  const [q, setQ] = useState('');
  const [selecting, setSelecting] = useState(false);
  const query = q.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flex: 1 }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.md }}>
            <Icon name="search" color={c.faint} size={18} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={tab === 'rooms' ? '대화방·메시지 검색' : '이름·부서·직책 검색'}
              placeholderTextColor={c.faint}
              style={{ flex: 1, paddingVertical: space.sm + 2, fontSize: font.body, fontFamily: family.regular, color: c.text }}
            />
            {q ? (
              <Pressable accessibilityLabel="검색어 지우기" onPress={() => setQ('')} hitSlop={8}>
                <Icon name="close" color={c.faint} size={16} />
              </Pressable>
            ) : null}
          </View>
          <View style={{ marginTop: space.sm }}>
            <UnderlineTabs tabs={[['contacts', '주소록'], ['rooms', '대화방']]} value={tab} onChange={setTab} />
          </View>
        </View>
        {tab === 'contacts' ? <ContactsPanel query={query} /> : <RoomsPanel query={query} onSelecting={setSelecting} />}
        {tab === 'rooms' && selecting ? null : (
        <Pressable
          accessibilityLabel="새 대화"
          onPress={() => router.push('/room/new')}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
          <Icon name="plus" color="#FFFFFF" size={28} />
        </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function ContactsPanel({ query }: { query: string }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [view, setView] = useState<'org' | 'external'>('org');
  const [dept, setDept] = useState<string>();
  const [hitTab, setHitTab] = useState<'all' | 'member' | 'group'>('all');
  const people = useMemo(() => contactsFor(user, s), [user, s]);
  const external = useMemo(() => externalContacts(user, s.users, s.rooms), [user, s.users, s.rooms]);
  const favorites = (s.favorites[user.id] ?? []).map((id) => s.users.find((u) => u.id === id)).filter((u) => !!u);
  const isFirm = user.role !== 'client';

  if (query) {
    const myRooms = s.rooms.filter((r) => r.memberIds.includes(user.id));
    const hits = searchDirectory(query, isFirm ? [...people, ...external] : people, myRooms).filter(
      (h) => hitTab === 'all' || (hitTab === 'member' ? h.type === 'member' : h.type !== 'member'),
    );
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}>
        <UnderlineTabs tabs={[['all', '전체'], ['member', '구성원'], ['group', '조직/그룹']]} value={hitTab} onChange={setHitTab} />
        {hits.length ? hits.map((h, i) => <HitRow key={i} h={h} onDept={(d) => { setDept(d); setView('org'); }} />) : <Empty text="검색 결과가 없습니다." />}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}>
      <ContactRow u={user} me />
      {isFirm ? (
        <>
          <UnderlineTabs tabs={[['org', '조직도'], ['external', '외부 연락처']]} value={view} onChange={setView} />
          {view === 'org' ? (
            <>
              {!dept && favorites.length ? (
                <View style={{ paddingTop: space.md }}>
                  <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.faint }}>즐겨찾기 {favorites.length}</Text>
                  {favorites.map((u) => <ContactRow key={u!.id} u={u!} />)}
                </View>
              ) : null}
              <OrgBrowser people={people} dept={dept} onDept={setDept} renderMember={(u) => <ContactRow u={u} me={u.id === user.id} />} />
            </>
          ) : external.length ? (
            external.map((u) => <ContactRow key={u.id} u={u} />)
          ) : (
            <Empty text="외부 연락처가 없습니다." />
          )}
        </>
      ) : people.length ? (
        people.map((u) => <ContactRow key={u.id} u={u} />)
      ) : (
        <Empty text="주소록에 표시할 사람이 없습니다." />
      )}
    </ScrollView>
  );
}

function HitRow({ h, onDept }: { h: DirectoryHit; onDept: (d: string) => void }) {
  const c = useColors();
  if (h.type === 'member') return <ContactRow u={h.user} />;
  const label = h.type === 'dept' ? h.dept : roomTitle(h.room);
  return (
    <Pressable
      onPress={() => (h.type === 'dept' ? onDept(h.dept) : router.push({ pathname: '/room/[id]', params: { id: h.room.id } }))}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, opacity: pressed ? 0.6 : 1 })}>
      <Avatar name={label} size={48} group />
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: family.bold, fontSize: 16, color: c.text }}>{label}</Text>
      {h.type === 'dept' ? <Text style={{ color: c.faint, fontFamily: family.regular }}>{h.count}</Text> : null}
      <Icon name="chevron" color={c.faint} size={16} />
    </Pressable>
  );
}

function RoomsPanel({ query, onSelecting }: { query: string; onSelecting: (v: boolean) => void }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [filter, setFilter] = useState<RoomFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const selecting = selected.length > 0;
  useEffect(() => onSelecting(selecting), [selecting, onSelecting]);

  const mine = useMemo(() => s.rooms.filter((r) => r.memberIds.includes(user.id)), [s.rooms, user.id]);
  const visible = useMemo(() => mine.filter((r) => !isHidden(r, user.id, s.messages)), [mine, user.id, s.messages]);
  const dots = Object.fromEntries(FILTERS.map(([k]) => [k, visible.some((r) => TEST[k](r) && unreadCount(r, user.id, s.messages, s.reads) > 0)])) as Record<RoomFilter, boolean>;
  const rooms = useMemo(() => {
    const list = visible.filter((r) => {
      if (!TEST[filter](r)) return false;
      if (!query) return true;
      return r.title.includes(query) || s.messages.some((m) => m.roomId === r.id && !m.recalled && m.text.includes(query));
    });
    return sortRooms(list, user.id, s.messages);
  }, [visible, filter, query, s.messages, user.id]);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const apply = (fn: (id: string) => unknown) => {
    selected.forEach(fn);
    setSelected([]);
  };
  const allPinned = selected.every((id) => mine.find((r) => r.id === id)?.pinnedBy?.includes(user.id));
  const allMuted = selected.every((id) => mine.find((r) => r.id === id)?.notify?.[user.id] === 'off');

  return (
    <View style={{ flex: 1 }}>
      {selecting ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Text style={{ fontFamily: family.bold, fontSize: 16, color: c.text }}>{selected.length}개 선택</Text>
          <Pressable onPress={() => setSelected([])} style={{ marginLeft: 'auto' }} hitSlop={8}>
            <Text style={{ fontFamily: family.semibold, fontSize: 15, color: c.sub }}>모두 취소</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.md }}>
          {FILTERS.map(([k, label]) => (
            <Pressable key={k} onPress={() => setFilter(k)} style={{ flexDirection: 'row' }}>
              <Text style={{ fontFamily: filter === k ? family.bold : family.regular, fontSize: font.small + 1, color: filter === k ? c.text : c.faint }}>{label}</Text>
              {dots[k] ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent, marginLeft: 2 }} /> : null}
            </Pressable>
          ))}
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}>
        {rooms.length ? (
          rooms.map((r) => <RoomRow key={r.id} room={r} selecting={selecting} selected={selected.includes(r.id)} onToggle={() => toggle(r.id)} />)
        ) : (
          <Empty text={query ? '검색 결과가 없습니다.' : '대화가 없습니다.'} />
        )}
      </ScrollView>
      {selecting ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space.md, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
          <BarButton icon="pin" label={allPinned ? '고정 해제' : '고정'} onPress={() => apply((id) => {
            const pinned = mine.find((r) => r.id === id)?.pinnedBy?.includes(user.id);
            if (pinned === allPinned) actions.togglePin(id);
          })} />
          <BarButton icon="mute" label={allMuted ? '알림 켜기' : '알림 끄기'} onPress={() => apply((id) => actions.setNotify(id, allMuted ? 'all' : 'off'))} />
          <BarButton icon="hide" label="숨기기" onPress={() => apply((id) => actions.hideRoom(id))} />
          <BarButton icon="exit" label="나가기" onPress={() => apply((id) => actions.leaveRoom(id))} />
        </View>
      ) : null}
    </View>
  );
}

function BarButton({ icon, label, onPress }: { icon: 'pin' | 'mute' | 'hide' | 'exit'; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 2, minWidth: 64 }}>
      <Icon name={icon} color={c.accent} size={22} />
      <Text style={{ fontFamily: family.semibold, fontSize: 12, color: c.sub }}>{label}</Text>
    </Pressable>
  );
}
