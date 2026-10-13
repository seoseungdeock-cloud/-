import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { contactsFor } from '@/core/contacts';
import { actions } from '@/core/store';
import type { Room, User } from '@/core/types';
import { Icon } from '@/ui/icons';
import { Avatar, Badge, Empty, Row } from '@/ui/kit';
import { RoomRow } from '@/ui/room-row';
import { family, font, MAX_WIDTH, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

const FILTERS: { key: string; label: string; test: (r: Room) => boolean }[] = [
  { key: 'all', label: '전체', test: () => true },
  { key: 'one', label: '1:1', test: (r) => r.memberIds.length <= 2 && r.kind !== 'meeting' && r.kind !== 'marketing' },
  { key: 'many', label: '여러 명', test: (r) => r.memberIds.length > 2 },
  { key: 'case', label: '사건수행', test: (r) => r.mode === 'private' },
  { key: 'ai', label: 'AI', test: (r) => r.mode === 'ai' },
];

// 메신저: 상단 검색, 주소록 / 대화방 두 탭 (네이버 웍스 메신저 구성 참고)
export default function MessengerScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const [tab, setTab] = useState<'rooms' | 'contacts'>('contacts');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const query = q.trim();

  const rooms = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return s.rooms.filter((r) => {
      if (!r.memberIds.includes(user.id) || !f.test(r)) return false;
      if (!query) return true;
      return r.title.includes(query) || s.messages.some((m) => m.roomId === r.id && m.text.includes(query));
    });
  }, [s.rooms, s.messages, user.id, filter, query]);

  const contacts = useMemo(
    () => contactsFor(user, s).filter((u) => !query || u.nickname.includes(query)),
    [user, s, query],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.md }}>
            <Icon name="search" color={c.faint} size={18} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={tab === 'rooms' ? '메시지 검색' : '이름 검색'}
              placeholderTextColor={c.faint}
              style={{ flex: 1, paddingVertical: space.sm + 2, fontSize: font.body, fontFamily: family.regular, color: c.text }}
            />
          </View>
          <Pressable accessibilityLabel="새 대화" onPress={() => router.push('/room/new')} hitSlop={12}>
            <Icon name="plus" color={c.text} size={26} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, marginTop: space.md, borderBottomWidth: 1, borderBottomColor: c.line }}>
          {(['contacts', 'rooms'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={{ paddingVertical: space.sm + 2, marginRight: space.xl, borderBottomWidth: 2.5, borderBottomColor: tab === t ? c.accent : 'transparent', marginBottom: -1 }}>
              <Text style={{ fontFamily: tab === t ? family.bold : family.regular, fontSize: font.body + 1, color: tab === t ? c.accent : c.sub }}>
                {t === 'rooms' ? '대화방' : '주소록'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'rooms' ? (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.md }}>
              {FILTERS.map((f) => (
                <Pressable key={f.key} onPress={() => setFilter(f.key)}>
                  <Text style={{ fontFamily: filter === f.key ? family.bold : family.regular, fontSize: font.small + 1, color: filter === f.key ? c.text : c.faint }}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ paddingHorizontal: space.lg, flex: 1 }}>
              {rooms.length ? rooms.map((r) => <RoomRow key={r.id} room={r} />) : <Empty text={query ? '검색 결과가 없습니다.' : '대화가 없습니다.'} />}
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: space.lg }}>
            <Row left={<Avatar name={user.nickname} />} title={user.nickname} sub={`나 · ${ROLE_LABEL[user.role]}${user.firm ? ` · ${user.firm}` : ''}`} />
            {contacts.length ? (
              contacts.map((u) => <ContactRow key={u.id} u={u} />)
            ) : (
              <Empty text="주소록에 표시할 사람이 없습니다." />
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function ContactRow({ u }: { u: User }) {
  return (
    <Row
      left={<Avatar name={u.nickname} />}
      title={u.nickname}
      sub={`${ROLE_LABEL[u.role]}${u.firm ? ` · ${u.firm}` : ''}`}
      right={<Badge label="1:1 대화" tone="plain" />}
      onPress={() => router.push({ pathname: '/room/[id]', params: { id: actions.openDirect(u.id) } })}
    />
  );
}
