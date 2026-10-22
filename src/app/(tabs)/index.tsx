import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isSelfRoom, SELF_ROOM_TITLE } from '@/core/calendar';
import { contactsFor } from '@/core/contacts';
import { clientCanSee, externalContacts, hasClient, isHidden, markParts, searchAll, sortRooms, unreadCount, searchDirectory, type DirectoryHit } from '@/core/messenger';
import { actions } from '@/core/store';
import type { Message, Room } from '@/core/types';
import { ContactRow, OrgBrowser, UnderlineTabs } from '@/ui/contacts';
import { Icon } from '@/ui/icons';
import { AuthBotRow } from '@/ui/auth-bot';
import { OpenPanel } from '@/ui/open-chat';
import { Avatar, Empty } from '@/ui/kit';
import { chatTime, roomTitle, RoomRow } from '@/ui/room-row';
import { family, font, MAX_WIDTH, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

type RoomFilter = 'all' | 'one' | 'many' | 'case';
const FILTERS: [RoomFilter, string][] = [['all', '전체'], ['one', '1:1'], ['many', '여러 명'], ['case', '사건수행']];
const TEST: Record<RoomFilter, (r: Room) => boolean> = {
  all: () => true,
  one: (r) => r.memberIds.length <= 2 && r.kind !== 'meeting' && r.kind !== 'marketing',
  many: (r) => r.memberIds.length > 2,
  case: (r) => r.kind === 'case' || r.kind === 'consult',
};

type Tab = 'contacts' | 'rooms' | 'open' | 'clients';
const PLACEHOLDER: Record<Tab, string> = {
  contacts: '이름·부서·직책 검색',
  rooms: '대화방·메시지 검색',
  open: '오픈대화방 검색 (#태그)',
  clients: '의뢰인·사건방·메시지 검색',
};

// 메신저: 주소록 / 대화방 / 오픈대화방 / 클라이언트 (네이버웍스 주소록·메시지 구성 참고)
// 의뢰인 계정은 자기 사건방만 보는 간단한 화면을 씁니다.
export default function MessengerScreen() {
  const user = useMe();
  return user.role === 'client' ? <ClientMessenger /> : <FirmMessenger />;
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.md }}>
      <Icon name="search" color={c.faint} size={18} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        style={{ flex: 1, paddingVertical: space.sm + 2, fontSize: font.body, ...family.regular, color: c.text }}
      />
      {value ? (
        <Pressable accessibilityLabel="검색어 지우기" onPress={() => onChange('')} hitSlop={8}>
          <Icon name="close" color={c.faint} size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 의뢰인: 내 사건방(상담·사건)만, 대화와 검색만 */
function ClientMessenger() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [q, setQ] = useState('');
  const query = q.trim();
  const rooms = useMemo(() => sortRooms(s.rooms.filter((r) => clientCanSee(r, user) || (isSelfRoom(r, user.id) && !isHidden(r, user.id, s.messages))), user.id, s.messages), [s.rooms, s.messages, user]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flex: 1 }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
          <Text style={{ ...family.heavy, fontSize: font.title, color: c.text }}>대화</Text>
          <SearchBar value={q} onChange={setQ} placeholder="사건방·메시지 검색" />
        </View>
        {query ? (
          <SearchResults query={query} scope={(r) => clientCanSee(r, user)} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 96 }}>
            <SelfChatRow />
            {rooms.length ? rooms.map((r) => <RoomRow key={r.id} room={r} />) : <Empty text="진행 중인 사건방이 없습니다." />}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

function FirmMessenger() {
  const c = useColors();
  const [tab, setTab] = useState<Tab>('contacts');
  const [q, setQ] = useState('');
  const [selecting, setSelecting] = useState(false);
  const query = q.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flex: 1 }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
          <SearchBar value={q} onChange={setQ} placeholder={PLACEHOLDER[tab]} />
          <View style={{ marginTop: space.sm }}>
            <UnderlineTabs
              tabs={[['contacts', '주소록'], ['rooms', '대화방'], ['open', '오픈대화방'], ['clients', '클라이언트']]}
              value={tab}
              onChange={(t) => {
                setTab(t);
                setSelecting(false);
              }}
            />
          </View>
        </View>
        {tab === 'contacts' ? (
          <ContactsPanel query={query} />
        ) : tab === 'open' ? (
          <OpenPanel query={query} />
        ) : (
          <RoomsPanel key={tab} query={query} onSelecting={setSelecting} scope={tab === 'clients' ? 'clients' : 'internal'} />
        )}
        {(tab === 'rooms' || tab === 'clients') && selecting ? null : tab === 'clients' ? null : (
        <Pressable
          accessibilityLabel={tab === 'open' ? '오픈대화방 만들기' : '새 대화'}
          onPress={() => router.push(tab === 'open' ? '/open/new' : '/room/new')}
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
                  <Text style={{ ...family.semibold, fontSize: 13, color: c.faint }}>즐겨찾기 {favorites.length}</Text>
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
      <Text numberOfLines={1} style={{ flex: 1, ...family.bold, fontSize: 16, color: c.text }}>{label}</Text>
      {h.type === 'dept' ? <Text style={{ color: c.faint, ...family.regular }}>{h.count}</Text> : null}
      <Icon name="chevron" color={c.faint} size={16} />
    </Pressable>
  );
}

// 대화방 탭은 내부 대화만, 클라이언트 탭은 의뢰인이 있는 방만 (변호사·직원 기준)
function RoomsPanel({ query, onSelecting, scope }: { query: string; onSelecting: (v: boolean) => void; scope: 'internal' | 'clients' }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [filter, setFilter] = useState<RoomFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const selecting = selected.length > 0;
  useEffect(() => onSelecting(selecting), [selecting, onSelecting]);

  const inScope = (r: Room) => r.memberIds.includes(user.id) && hasClient(r, s.users) === (scope === 'clients');
  const mine = useMemo(() => s.rooms.filter(inScope), [s.rooms, user.id, s.users, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => mine.filter((r) => !isHidden(r, user.id, s.messages)), [mine, user.id, s.messages]);
  const dots = Object.fromEntries(FILTERS.map(([k]) => [k, visible.some((r) => TEST[k](r) && unreadCount(r, user.id, s.messages, s.reads) > 0)])) as Record<RoomFilter, boolean>;
  const rooms = useMemo(() => {
    return sortRooms(visible.filter((r) => TEST[filter](r)), user.id, s.messages);
  }, [visible, filter, s.messages, user.id]);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const apply = (fn: (id: string) => unknown) => {
    selected.forEach(fn);
    setSelected([]);
  };
  const allPinned = selected.every((id) => mine.find((r) => r.id === id)?.pinnedBy?.includes(user.id));
  const allMuted = selected.every((id) => mine.find((r) => r.id === id)?.notify?.[user.id] === 'off');

  if (query) return <SearchResults query={query} scope={inScope} />;

  return (
    <View style={{ flex: 1 }}>
      {selecting ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md }}>
          <Text style={{ ...family.bold, fontSize: 16, color: c.text }}>{selected.length}개 선택</Text>
          <Pressable onPress={() => setSelected([])} style={{ marginLeft: 'auto' }} hitSlop={8}>
            <Text style={{ ...family.semibold, fontSize: 15, color: c.sub }}>모두 취소</Text>
          </Pressable>
        </View>
      ) : scope === 'clients' ? (
        <View style={{ height: space.sm }} />
      ) : (
        <View style={{ flexDirection: 'row', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.md }}>
          {FILTERS.map(([k, label]) => (
            <Pressable key={k} onPress={() => setFilter(k)} style={{ flexDirection: 'row' }}>
              <Text style={{ ...(filter === k ? family.bold : family.regular), fontSize: 13, color: filter === k ? c.text : c.faint }}>{label}</Text>
              {dots[k] ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent, marginLeft: 2 }} /> : null}
            </Pressable>
          ))}
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}>
        {scope === 'internal' && filter === 'all' && !selecting ? <AuthBotRow /> : null}
        {scope === 'internal' && filter === 'all' && !selecting ? <SelfChatRow /> : null}
        {rooms.length ? (
          rooms.map((r) => <RoomRow key={r.id} room={r} selecting={selecting} selected={selected.includes(r.id)} onToggle={() => toggle(r.id)} />)
        ) : (
          <Empty text={scope === 'clients' ? '의뢰인과의 대화방이 없습니다.' : '대화가 없습니다.'} />
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
      <Text style={{ ...family.semibold, fontSize: 12, color: c.sub }}>{label}</Text>
    </Pressable>
  );
}

// 대화 탭 전체 검색: 메시지방·멤버 이름 / 메시지 / 파일 (각각 접기, 최신순)
function SearchResults({ query, scope }: { query: string; scope: (r: Room) => boolean }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const res = useMemo(() => searchAll(query, user.id, s.rooms.filter(scope), s.messages, s.users), [query, user.id, s.rooms, s.messages, s.users, scope]);
  const roomOf = (id: string) => s.rooms.find((r) => r.id === id);
  const sender = (m: Message) => s.users.find((u) => u.id === m.senderId)?.nickname ?? '';
  const Mark = ({ text, style }: { text: string; style: object }) => (
    <Text numberOfLines={2} style={style}>
      {markParts(text, query).map((p, i) =>
        p.mark ? (
          <Text key={i} style={{ backgroundColor: c.mark, color: c.markText }}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
  const Section = ({ k, title, count, children }: { k: string; title: string; count: number; children: ReactNode }) => (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Pressable accessibilityLabel={`${title} 접기`} onPress={() => setClosed((x) => ({ ...x, [k]: !x[k] }))} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md }}>
        <Text style={{ ...family.bold, fontSize: 16, color: c.text }}>{title}</Text>
        <Text style={{ ...family.semibold, fontSize: 14, color: c.accent, marginLeft: 6 }}>{count}</Text>
        <View style={{ marginLeft: 'auto', transform: [{ rotate: closed[k] ? '90deg' : '-90deg' }] }}>
          <Icon name="chevron" color={c.faint} size={18} />
        </View>
      </Pressable>
      {closed[k] ? null : count ? <View style={{ paddingBottom: space.sm }}>{children}</View> : <Text style={{ ...family.regular, fontSize: 14, color: c.faint, paddingBottom: space.md }}>결과 없음</Text>}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}>
      <Section k="rooms" title="메시지방/멤버 이름" count={res.rooms.length}>
        {res.rooms.map((r) => (
          <RoomRow key={r.id} room={r} />
        ))}
      </Section>
      <Section k="messages" title="메시지" count={res.messages.length}>
        {res.messages.map((m) => {
          const r = roomOf(m.roomId)!;
          return (
            <Pressable
              key={m.id}
              onPress={() => router.push({ pathname: '/room/[id]', params: { id: m.roomId, q: query, focus: m.id } })}
              style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.6 : 1 })}>
              <Avatar name={r.title} size={44} group={r.memberIds.length > 2} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text numberOfLines={1} style={{ flex: 1, ...family.bold, fontSize: 15, color: c.text }}>{roomTitle(r)}</Text>
                  <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>{chatTime(m.at)}</Text>
                </View>
                <Mark text={`${sender(m)}: ${m.bundle ? m.bundle.items.map((i) => i.text).join(' / ') : m.text}`} style={{ ...family.regular, fontSize: 14, lineHeight: 20, color: c.sub }} />
              </View>
            </Pressable>
          );
        })}
      </Section>
      <Section k="files" title="파일" count={res.files.length}>
        {res.files.map((f, i) => (
          <Pressable
            key={`${f.room.id}${i}`}
            onPress={() => router.push({ pathname: '/room/[id]', params: { id: f.room.id } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="file" color={c.sub} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Mark text={f.name} style={{ ...family.semibold, fontSize: 15, color: c.text }} />
              <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.faint }}>
                {roomTitle(f.room)} · {chatTime(f.at)}
              </Text>
            </View>
          </Pressable>
        ))}
      </Section>
    </ScrollView>
  );
}

/** 나와의 메시지를 아직 안 열었으면(또는 목록에서 숨겼으면) 대화 목록 맨 위에 자리를 보여 줍니다. 한 번 열면 일반 대화방처럼 목록에 섞입니다. */
function SelfChatRow() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const room = s.rooms.find((r) => isSelfRoom(r, user.id));
  if (room && !isHidden(room, user.id, s.messages)) return null;
  return (
    <Pressable onPress={() => router.push({ pathname: '/room/[id]', params: { id: actions.openSelfChat() } })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, opacity: pressed ? 0.7 : 1 })}>
      <Avatar name={user.nickname} uri={user.photo} size={42} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...family.bold, fontSize: 14, color: c.text }}>{SELF_ROOM_TITLE}</Text>
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 13, color: c.sub, marginTop: 2 }}>메모나 파일을 나에게 보내 두세요</Text>
      </View>
    </Pressable>
  );
}
