import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { lastMessage, mentionedUnread, notifyLevel, previewText, unreadCount } from '@/core/messenger';
import type { Room } from '@/core/types';
import { Icon } from './icons';
import { Avatar, ModeBadge } from './kit';
import { family, radius, space, useColors } from './theme';
import { useApp, useMe } from './use-app';
import { useLayout } from './web-frame';

/** 대화방 열기. PC 2단 구성에서 다른 방을 보고 있었으면 쌓지 않고 바꿉니다. */
export function openRoom(id: string, params?: Record<string, string>) {
  const href = { pathname: '/room/[id]' as const, params: { id, ...params } };
  const path = typeof globalThis.location?.pathname === 'string' ? globalThis.location.pathname : '';
  if (path.startsWith('/room/') && !path.startsWith('/room/new') && !path.startsWith('/room/create') && !path.startsWith('/room/bundle')) router.replace(href);
  else router.push(href);
}

/** '오후 8:47' */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 오늘이면 '오후 8:47', 아니면 '10월 8일' */
export function chatTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return clockTime(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function roomTitle(room: Room): string {
  return room.memberIds.length > 2 ? `${room.title} (${room.memberIds.length})` : room.title;
}

// 대화 목록 한 줄 (웍스 메시지 목록 구성: 고정·알림 끄기 표시, 시간, 미리보기, 안 읽은 수, 멘션 알림)
export function RoomRow({ room, selecting, selected, onToggle }: { room: Room; selecting?: boolean; selected?: boolean; onToggle?: () => void }) {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const last = lastMessage(room, s.messages, user.id);
  const unread = unreadCount(room, user.id, s.messages, s.reads);
  const mentioned = unread > 0 && mentionedUnread(room, user.id, s.messages, s.reads);
  const pinned = room.pinnedBy?.includes(user.id);
  const muted = notifyLevel(room, user.id) !== 'all';
  const group = room.memberIds.length > 2;
  const { desktop } = useLayout();
  const pathname = usePathname();
  // PC 2단 구성: 지금 열려 있는 방을 표시
  const on = desktop && pathname === `/room/${room.id}`;
  return (
    <Pressable
      onPress={() => (selecting ? onToggle?.() : desktop ? openRoom(room.id) : router.push({ pathname: '/room/[id]', params: { id: room.id } }))}
      onLongPress={onToggle}
      style={(st) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm + 4,
        paddingVertical: 7,
        ...(desktop ? { paddingHorizontal: space.sm, marginHorizontal: -space.sm, borderRadius: radius.md, backgroundColor: on ? c.accentSoft : (st as { hovered?: boolean }).hovered ? c.surface : 'transparent' } : null),
        opacity: st.pressed ? 0.6 : 1,
      })}>
      {selecting ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: selected ? c.accent : c.faint, backgroundColor: selected ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Icon name="check" color="#FFFFFF" size={14} /> : null}
        </View>
      ) : null}
      <View>
        <Avatar name={room.title} size={38} group={group} uri={room.photo ?? (room.kind === 'direct' ? s.users.find((u) => u.id !== user.id && room.memberIds.includes(u.id))?.photo : undefined)} />
        {pinned ? (
          <View style={{ position: 'absolute', left: -4, top: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pin" color={c.accent} size={13} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, ...family.bold, fontSize: 13.5, color: c.text }}>{roomTitle(room)}</Text>
          {muted ? <Icon name="mute" color={c.faint} size={15} /> : null}
          <View style={{ marginLeft: 'auto', paddingLeft: space.sm }}>
            <Text style={{ ...family.regular, fontSize: 11, color: c.faint }}>{last ? chatTime(last.at) : ''}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={mentioned ? 1 : 2} style={{ ...family.regular, fontSize: 12.5, lineHeight: 17, color: c.sub }}>{previewText(last, s.users)}</Text>
            {mentioned ? <Text style={{ ...family.semibold, fontSize: 12, color: c.accent }}>멘션되었습니다.</Text> : null}
          </View>
          {room.kind === 'case' ? <ModeBadge mode="private" /> : null}
          {unread ? (
            <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ color: '#FFFFFF', ...family.bold, fontSize: 11 }}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
