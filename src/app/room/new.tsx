import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { contactsFor } from '@/core/contacts';
import { displayName, externalContacts } from '@/core/messenger';
import { isWorkUser } from '@/core/rooms';
import { actions } from '@/core/store';
import type { User } from '@/core/types';
import { ContactRow, OrgBrowser, UnderlineTabs } from '@/ui/contacts';
import { Icon } from '@/ui/icons';
import { Avatar, Empty, Notice, Screen } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

// 멤버 선택 (새 대화·초대). roomId가 있으면 그 방에 초대합니다.
export default function PickMembersScreen() {
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const room = roomId ? s.rooms.find((r) => r.id === roomId) : undefined;
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'fav' | 'org' | 'external'>('org');
  const [dept, setDept] = useState<string>();
  const [error, setError] = useState<string>();
  const people = useMemo(() => contactsFor(user, s), [user, s]);
  const external = useMemo(() => (isWorkUser(user) ? externalContacts(user, s.users, s.rooms) : []), [user, s.users, s.rooms]);
  const favorites = (s.favorites[user.id] ?? []).map((id) => s.users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const already = new Set(room?.memberIds ?? [user.id]);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const confirm = () => {
    const res = room ? actions.invite(room.id, picked) : actions.startChat(picked);
    if (!res.ok) return setError(res.reason);
    router.replace({ pathname: '/room/[id]', params: { id: res.roomId! } });
  };

  const row = (u: User) => {
    const disabled = already.has(u.id);
    const on = disabled || picked.includes(u.id);
    return (
      <ContactRow
        key={u.id}
        u={u}
        onPress={disabled ? () => undefined : () => toggle(u.id)}
        left={
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: on ? c.accent : c.faint, backgroundColor: on ? (disabled ? c.faint : c.accent) : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {on ? <Icon name="check" color="#FFFFFF" size={14} /> : null}
          </View>
        }
      />
    );
  };

  const query = q.trim();
  const pool = [...people, ...external];
  const found = query ? pool.filter((u) => [u.nickname, u.title, u.dept, u.branch].some((v) => v?.includes(query))) : [];

  const right = (
    <Pressable onPress={confirm} hitSlop={10}>
      <Text style={{ ...family.bold, fontSize: 16, color: picked.length ? c.accent : c.faint }}>확인 ({picked.length})</Text>
    </Pressable>
  );

  return (
    <Screen title={room ? '멤버 초대' : '멤버 선택'} back right={right} scroll={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: space.md, marginBottom: space.sm }}>
        <Icon name="search" color={c.faint} size={18} />
        <TextInput value={q} onChangeText={setQ} placeholder="연락처 검색" placeholderTextColor={c.faint} style={{ flex: 1, paddingVertical: space.sm + 2, fontSize: 15, ...family.regular, color: c.text }} />
      </View>
      {!query ? (
        <UnderlineTabs
          tabs={isWorkUser(user) ? [['fav', '즐겨찾기'], ['org', '조직도'], ['external', '외부 연락처']] : [['org', '연락처']]}
          value={view}
          onChange={setView}
        />
      ) : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.xl }}>
        {query ? (
          found.length ? found.map(row) : <Empty text="검색 결과가 없습니다." />
        ) : view === 'fav' ? (
          favorites.length ? favorites.map(row) : <Empty text="즐겨찾기한 사람이 없습니다." />
        ) : view === 'external' ? (
          external.length ? external.map(row) : <Empty text="외부 연락처가 없습니다." />
        ) : isWorkUser(user) ? (
          <OrgBrowser people={people} dept={dept} onDept={setDept} renderMember={row} />
        ) : people.length ? (
          people.map(row)
        ) : (
          <Empty text="대화할 수 있는 사람이 없습니다." />
        )}
        {!room && isWorkUser(user) ? (
          <Pressable onPress={() => router.push('/room/create')} style={{ paddingVertical: space.lg, alignItems: 'center' }}>
            <Text style={{ ...family.semibold, fontSize: 14, color: c.sub }}>방 종류를 골라 만들기 (사무소·회의·마케팅)</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {error ? <Notice text={error} /> : null}
      {picked.length ? (
        <ScrollView horizontal style={{ flexGrow: 0, borderTopWidth: 1, borderTopColor: c.line }} contentContainerStyle={{ gap: space.md, paddingVertical: space.md }}>
          {picked.map((id) => {
            const u = s.users.find((x) => x.id === id)!;
            return (
              <Pressable key={id} onPress={() => toggle(id)} style={{ alignItems: 'center', width: 64 }}>
                <Avatar name={u.nickname} size={48} uri={u.photo} />
                <Text numberOfLines={1} style={{ ...family.regular, fontSize: 12, color: c.sub, marginTop: 2 }}>{displayName(u)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </Screen>
  );
}
