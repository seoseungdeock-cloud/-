// 대화 목록. 모바일은 '대화' 탭 전체(위에 남색 띠: 제목·주소록·오픈대화방·새 대화·검색), PC 는 왼쪽 340px 칸으로 쓰고 오른쪽에 대화를 엽니다.
// 대화방이 한 목록이고 칩(전체·안 읽음·1:1·그룹·의뢰인)으로만 걸러 봅니다. 주소록·오픈대화방은 위 아이콘으로 열고 ← 로 돌아옵니다.
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isSelfRoom, SELF_ROOM_TITLE } from '@/core/calendar';
import { contactsFor } from '@/core/contacts';
import { clientCanSee, externalContacts, hasClient, isHidden, markParts, searchAll, searchDirectory, sortRooms, unreadCount, type DirectoryHit } from '@/core/messenger';
import { actions } from '@/core/store';
import type { Message, Room } from '@/core/types';
import { AuthBotRow } from '@/ui/auth-bot';
import { CrmContacts } from '@/ui/crm-contacts';
import { ContactRow, OrgBrowser, UnderlineTabs } from '@/ui/contacts';
import { Icon, type IconName } from '@/ui/icons';
import { Avatar, Empty } from '@/ui/kit';
import { Appear, Fade, Press } from '@/ui/motion';
import { OpenPanel } from '@/ui/open-chat';
import { chatTime, RoomRow, roomTitle } from '@/ui/room-row';
import { ChipBar } from '@/ui/segments';
import { family, font, MAX_WIDTH, radius, space, tracking, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';
import { useLayout } from '@/ui/web-frame';

export const LIST_PANE_WIDTH = 340;

/** PC: 왼쪽 목록 + 오른쪽 대화(children). 대화방을 바꿔도 목록은 그대로 보입니다. */
export function MessengerSplit({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
      <View style={{ width: LIST_PANE_WIDTH, borderRightWidth: 1, borderRightColor: c.lineStrong }}>
        <MessengerList />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/** PC 에서 대화를 아직 고르지 않았을 때 오른쪽 칸 */
export function EmptyPane() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl, backgroundColor: c.bg }}>
      <Appear>
        <View style={{ width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm, backgroundColor: c.navBg, alignSelf: 'center' }}>
          <Icon name="chat" color={c.navText} size={30} />
        </View>
      </Appear>
      <Appear index={1}>
        <Text style={{ ...family.bold, fontSize: 18, color: c.text, letterSpacing: tracking.h3, textAlign: 'center' }}>대화를 골라 주세요</Text>
      </Appear>
      <Appear index={2}>
        <Text style={{ ...family.regular, fontSize: 13.5, color: c.sub, textAlign: 'center', lineHeight: 20 }}>왼쪽에서 대화방을 고르거나 「새 대화」로 구성원에게 말을 걸어 보세요.{'\n'}사진·파일은 대화창에 끌어다 놓으면 바로 보내집니다.</Text>
      </Appear>
    </View>
  );
}

type RoomFilter = 'all' | 'unread' | 'one' | 'many' | 'client';
const FILTERS: [RoomFilter, string][] = [['all', '전체'], ['unread', '안 읽음'], ['one', '1:1'], ['many', '그룹'], ['client', '의뢰인']];

type View_ = 'rooms' | 'contacts' | 'open';
const TITLE: Record<View_, string> = { rooms: '대화', contacts: '주소록', open: '오픈대화방' };
const PLACEHOLDER: Record<View_, string> = {
  rooms: '대화방·메시지·파일 검색',
  contacts: '이름·부서·직책 검색',
  open: '오픈대화방 검색 (#태그)',
};

// 의뢰인 계정은 자기 사건방만 보는 간단한 화면을 씁니다.
export function MessengerList() {
  const user = useMe();
  return user.role === 'client' ? <ClientMessenger /> : <FirmMessenger />;
}

// PC 에서 대화방을 바꾸면 이 목록이 다시 만들어지므로, 보고 있던 화면·칩을 기억해 둡니다 (이 창 안에서만)
const sticky: { view?: View_; filter?: RoomFilter } = {};

/** 위 띠. 폰은 남색(상태 막대까지), PC 목록 칸은 흰색. */
function Head({ title, back, right, children }: { title: string; back?: () => void; right?: ReactNode; children?: ReactNode }) {
  const c = useColors();
  const { desktop } = useLayout();
  const fg = desktop ? c.text : c.navText;
  return (
    <View style={{ backgroundColor: desktop ? c.bg : c.navBg, paddingHorizontal: space.lg, paddingTop: desktop ? space.md + 2 : space.sm, paddingBottom: desktop ? space.sm : space.lg + 10, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, gap: 2 }}>
        {back ? (
          <Press accessibilityLabel="대화 목록으로" onPress={back} scale={0.9} style={{ width: 36, height: 36, marginLeft: -10, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" color={fg} size={22} />
          </Press>
        ) : null}
        <Fade key={title}>
          <Text style={{ ...family.heavy, fontSize: desktop ? font.h2 : font.title - 2, color: fg, letterSpacing: desktop ? tracking.h2 : tracking.title }}>{title}</Text>
        </Fade>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 }}>{right}</View>
      </View>
      {children}
    </View>
  );
}

/** 띠 위의 동그란 아이콘 버튼 */
function HeadButton({ icon, label, onPress, on, primary }: { icon: IconName; label: string; onPress: () => void; on?: boolean; primary?: boolean }) {
  const c = useColors();
  const { desktop } = useLayout();
  const bg = primary ? (desktop ? c.accent : c.navAccent) : on ? (desktop ? c.surface : c.navActive) : 'transparent';
  const fg = primary ? '#FFFFFF' : desktop ? c.text : c.navText;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={0.88}
      style={({ hovered }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered && !primary ? (desktop ? c.surface : c.navHover) : bg })}>
      <Icon name={icon} color={fg} size={primary ? 20 : 21} />
    </Press>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const c = useColors();
  const { desktop } = useLayout();
  const onNav = !desktop;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: onNav ? 'rgba(255,255,255,0.12)' : c.surface, borderRadius: radius.md + 2, paddingHorizontal: space.md + 2, height: 44 }}>
      <Icon name="search" color={onNav ? c.navMute : c.mute} size={18} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={onNav ? c.navMute : c.mute}
        style={{ flex: 1, height: '100%', fontSize: font.body, ...family.regular, color: onNav ? c.navText : c.text, ...({ outlineStyle: 'none' } as object) }}
      />
      {value ? (
        <Pressable accessibilityLabel="검색어 지우기" onPress={() => onChange('')} hitSlop={8}>
          <Icon name="close" color={onNav ? c.navMute : c.faint} size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 띠 아래 흰 본문 (폰은 위 모서리를 둥글게 띠 위로 올림) */
function Body({ children }: { children: ReactNode }) {
  const c = useColors();
  const { desktop } = useLayout();
  return <View style={{ flex: 1, backgroundColor: c.bg, ...(desktop ? null : { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, marginTop: -radius.xl + 6 }) }}>{children}</View>;
}

function Frame({ children }: { children: ReactNode }) {
  const c = useColors();
  const { desktop } = useLayout();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: desktop ? c.bg : c.navBg }} edges={['top', 'left', 'right']}>
      <View style={{ width: '100%', maxWidth: desktop ? undefined : MAX_WIDTH, alignSelf: 'center', flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}

/** 의뢰인: 내 사건방(상담·사건)만, 대화와 검색만 */
function ClientMessenger() {
  const s = useApp();
  const user = useMe();
  const [q, setQ] = useState('');
  const query = q.trim();
  const rooms = useMemo(() => sortRooms(s.rooms.filter((r) => clientCanSee(r, user) || (isSelfRoom(r, user.id) && !isHidden(r, user.id, s.messages))), user.id, s.messages), [s.rooms, s.messages, user]);
  return (
    <Frame>
      <Head title="대화">
        <SearchBar value={q} onChange={setQ} placeholder="사건방·메시지 검색" />
      </Head>
      <Body>
        {query ? (
          <SearchResults query={query} scope={(r) => clientCanSee(r, user)} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 96 }}>
            <SelfChatRow />
            {rooms.length ? rooms.map((r, i) => <Appear key={r.id} index={i}><RoomRow room={r} /></Appear>) : <Empty text="진행 중인 사건방이 없습니다." />}
          </ScrollView>
        )}
      </Body>
    </Frame>
  );
}

function FirmMessenger() {
  const c = useColors();
  const { desktop } = useLayout();
  const [view, setViewState] = useState<View_>(sticky.view ?? 'rooms');
  const setView = (v: View_) => {
    sticky.view = v;
    setViewState(v);
    setQ('');
  };
  const [q, setQ] = useState('');
  const [, setSelecting] = useState(false);
  const query = q.trim();
  const newLabel = view === 'open' ? '오픈대화방 만들기' : '새 대화';
  const goNew = () => router.push(view === 'open' ? '/open/new' : '/room/new');

  const right = (
    <>
      {view === 'rooms' ? <HeadButton icon="contact" label="주소록" onPress={() => setView('contacts')} /> : null}
      {view === 'rooms' ? <HeadButton icon="people" label="오픈대화방" onPress={() => setView('open')} /> : null}
      {view === 'contacts' ? null : <HeadButton icon="plus" label={newLabel} onPress={goNew} primary />}
    </>
  );

  return (
    <Frame>
      <Head title={TITLE[view]} back={view === 'rooms' ? undefined : () => setView('rooms')} right={right}>
        <SearchBar value={q} onChange={setQ} placeholder={PLACEHOLDER[view]} />
      </Head>
      <Body>
        <Fade key={view} style={{ flex: 1 }}>
          {view === 'contacts' ? <ContactsPanel query={query} /> : view === 'open' ? <OpenPanel query={query} /> : <RoomsPanel query={query} onSelecting={setSelecting} />}
        </Fade>
      </Body>
    </Frame>
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 96 }}>
        <UnderlineTabs tabs={[['all', '전체'], ['member', '구성원'], ['group', '조직/그룹']]} value={hitTab} onChange={setHitTab} />
        {hits.length ? hits.map((h, i) => <Appear key={i} index={i}><HitRow h={h} onDept={(d) => { setDept(d); setView('org'); }} /></Appear>) : <Empty text="검색 결과가 없습니다." />}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 96 }}>
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
          ) : (
            <>
              <CrmContacts query="" />
              {external.length ? external.map((u, i) => <Appear key={u.id} index={i}><ContactRow u={u} /></Appear>) : <Empty text="사건방에 함께 있는 의뢰인이 없습니다." />}
            </>
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
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
      <Avatar name={label} size={38} group />
      <Text numberOfLines={1} style={{ flex: 1, ...family.bold, fontSize: 14, color: c.text }}>{label}</Text>
      {h.type === 'dept' ? <Text style={{ color: c.faint, ...family.regular }}>{h.count}</Text> : null}
      <Icon name="chevron" color={c.faint} size={16} />
    </Pressable>
  );
}

// 내 대화방 전부를 한 목록으로. 칩으로 걸러 봅니다 (의뢰인 = 의뢰인이 있는 방, 변호사·직원 기준).
function RoomsPanel({ query, onSelecting }: { query: string; onSelecting: (v: boolean) => void }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [filter, setFilterState] = useState<RoomFilter>(sticky.filter ?? 'all');
  const setFilter = (f: RoomFilter) => {
    sticky.filter = f;
    setFilterState(f);
  };
  const [selected, setSelected] = useState<string[]>([]);
  const selecting = selected.length > 0;
  useEffect(() => onSelecting(selecting), [selecting, onSelecting]);

  const inScope = (r: Room) => r.memberIds.includes(user.id);
  const mine = useMemo(() => s.rooms.filter(inScope), [s.rooms, user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => mine.filter((r) => !isHidden(r, user.id, s.messages)), [mine, user.id, s.messages]);
  const unreadOf = (r: Room) => unreadCount(r, user.id, s.messages, s.reads);
  const test: Record<RoomFilter, (r: Room) => boolean> = {
    all: () => true,
    unread: (r) => unreadOf(r) > 0,
    one: (r) => r.memberIds.length <= 2 && r.kind !== 'meeting' && r.kind !== 'marketing' && !hasClient(r, s.users),
    many: (r) => r.memberIds.length > 2 && !hasClient(r, s.users),
    client: (r) => hasClient(r, s.users),
  };
  const dots = Object.fromEntries(FILTERS.map(([k]) => [k, k !== 'all' && k !== 'unread' && visible.some((r) => test[k](r) && unreadOf(r) > 0)])) as Record<RoomFilter, boolean>;
  const rooms = useMemo(() => sortRooms(visible.filter((r) => test[filter](r)), user.id, s.messages), [visible, filter, s.messages, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, height: 50 }}>
          <Text style={{ ...family.bold, fontSize: 16, color: c.text }}>{selected.length}개 선택</Text>
          <Pressable onPress={() => setSelected([])} style={{ marginLeft: 'auto' }} hitSlop={8}>
            <Text style={{ ...family.semibold, fontSize: 15, color: c.sub }}>모두 취소</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ paddingVertical: space.sm, height: 50, justifyContent: 'center' }}>
          <ChipBar items={FILTERS} value={filter} onChange={setFilter} dots={dots} size="sm" />
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}>
        {filter === 'all' && !selecting ? <AuthBotRow /> : null}
        {filter === 'all' && !selecting ? <SelfChatRow /> : null}
        {rooms.length ? (
          rooms.map((r, i) => (
            <Appear key={r.id} index={i}>
              <RoomRow room={r} selecting={selecting} selected={selected.includes(r.id)} onToggle={() => toggle(r.id)} />
            </Appear>
          ))
        ) : (
          <Empty text={filter === 'unread' ? '안 읽은 대화가 없습니다.' : filter === 'client' ? '의뢰인과의 대화방이 없습니다.' : '대화가 없습니다.'} hint={filter === 'all' ? '위의 + 로 구성원에게 말을 걸어 보세요.' : undefined} />
        )}
      </ScrollView>
      {selecting ? (
        <Appear layout={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space.md, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
            <BarButton icon="pin" label={allPinned ? '고정 해제' : '고정'} onPress={() => apply((id) => {
              const pinned = mine.find((r) => r.id === id)?.pinnedBy?.includes(user.id);
              if (pinned === allPinned) actions.togglePin(id);
            })} />
            <BarButton icon="mute" label={allMuted ? '알림 켜기' : '알림 끄기'} onPress={() => apply((id) => actions.setNotify(id, allMuted ? 'all' : 'off'))} />
            <BarButton icon="hide" label="숨기기" onPress={() => apply((id) => actions.hideRoom(id))} />
            <BarButton icon="exit" label="나가기" onPress={() => apply((id) => actions.leaveRoom(id))} />
          </View>
        </Appear>
      ) : null}
    </View>
  );
}

function BarButton({ icon, label, onPress }: { icon: 'pin' | 'mute' | 'hide' | 'exit'; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Press onPress={onPress} scale={0.9} style={{ alignItems: 'center', gap: 2, minWidth: 64 }}>
      <Icon name={icon} color={c.accent} size={22} />
      <Text style={{ ...family.semibold, fontSize: 12, color: c.sub }}>{label}</Text>
    </Press>
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
              <Avatar name={r.title} size={38} group={r.memberIds.length > 2} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text numberOfLines={1} style={{ flex: 1, ...family.bold, fontSize: 13.5, color: c.text }}>{roomTitle(r)}</Text>
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
    <Pressable onPress={() => router.push({ pathname: '/room/[id]', params: { id: actions.openSelfChat() } })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingVertical: 7, opacity: pressed ? 0.7 : 1 })}>
      <Avatar name={user.nickname} uri={user.photo} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...family.bold, fontSize: 13.5, color: c.text }}>{SELF_ROOM_TITLE}</Text>
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12.5, color: c.sub, marginTop: 2 }}>메모나 파일을 나에게 보내 두세요</Text>
      </View>
    </Pressable>
  );
}
