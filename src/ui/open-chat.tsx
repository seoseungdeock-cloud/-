// 오픈대화방 목록 (대화 탭의 '오픈대화방')
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { aliasOf, isLocked, lastOpenMessage, searchOpenRooms, splitOpenRooms } from '@/core/open-chat';
import type { OpenRoom } from '@/core/types';
import { Icon } from './icons';
import { Empty } from './kit';
import { chatTime } from './room-row';
import { family, radius, space, useColors } from './theme';
import { useApp, useMe } from './use-app';

/** 오픈대화방 그림: 실제 프로필 대신 방 이름 첫 글자 */
export function OpenAvatar({ label, size = 48 }: { label: string; size?: number }) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.bg, ...family.bold, fontSize: Math.round(size * 0.38) }}>{label.slice(0, 1)}</Text>
    </View>
  );
}

function OpenRow({ room, mine }: { room: OpenRoom; mine: boolean }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const last = lastOpenMessage(room.id, s.openMessages);
  const lastAlias = last && !last.system ? aliasOf(room, last.senderId) : undefined;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/open/[id]', params: { id: room.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}>
      <OpenAvatar label={room.title} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, ...family.bold, fontSize: 16, color: c.text }}>{room.title}</Text>
          <Text style={{ ...family.regular, fontSize: 13, color: c.faint }}>{room.members.length}</Text>
          {isLocked(room) ? <Icon name="lock" color={c.faint} size={14} /> : null}
          {mine && last ? <Text style={{ marginLeft: 'auto', ...family.regular, fontSize: 12, color: c.faint }}>{chatTime(last.at)}</Text> : null}
        </View>
        <Text numberOfLines={1} style={{ ...family.regular, fontSize: 14, color: c.sub }}>
          {mine ? (last ? `${lastAlias ? `${lastAlias}: ` : ''}${last.text}` : room.description) : room.description || ' '}
        </Text>
        {!mine ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {room.tags.map((t) => (
              <View key={t} style={{ backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ ...family.semibold, fontSize: 12, color: c.sub }}>#{t}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ ...family.regular, fontSize: 12, color: c.faint }}>{`내 닉네임 ${aliasOf(room, user.id)}${room.hostId === user.id ? ' · 방장' : ''}`}</Text>
        )}
      </View>
    </Pressable>
  );
}

export function OpenPanel({ query }: { query: string }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const { mine, others } = useMemo(() => splitOpenRooms(s.openRooms, s.openMessages, user.id), [s.openRooms, s.openMessages, user.id]);
  const shownMine = searchOpenRooms(mine, query);
  const shownOthers = searchOpenRooms(others, query);
  const head = (t: string, n: number) => (
    <Text style={{ ...family.bold, fontSize: 15, color: c.text, marginTop: space.md }}>
      {t} <Text style={{ color: c.accent }}>{n}</Text>
    </Text>
  );
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}>
      {head('참여 중', shownMine.length)}
      {shownMine.length ? shownMine.map((r) => <OpenRow key={r.id} room={r} mine />) : <Empty text={query ? '검색 결과가 없습니다.' : '참여 중인 오픈대화방이 없습니다.'} />}
      {head('둘러보기', shownOthers.length)}
      {shownOthers.length ? shownOthers.map((r) => <OpenRow key={r.id} room={r} mine={false} />) : <Empty text={query ? '검색 결과가 없습니다.' : '새로운 방이 없습니다.'} />}
    </ScrollView>
  );
}
