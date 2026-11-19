import { router, usePathname } from 'expo-router';
import { Text, View } from 'react-native';

import { lastMessage, mentionedUnread, notifyLevel, previewText, unreadCount } from '@/core/messenger';
import type { Room } from '@/core/types';
import { Icon } from './icons';
import { Avatar, ModeBadge } from './kit';
import { Bounce, Pop, Press } from './motion';
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

// 대화 목록 한 줄 (고정·알림 끄기 표시, 시간, 미리보기, 안 읽은 수, 멘션 알림). 누르면 살짝 눌리고 PC 에서는 열린 방이 회색 칸으로 표시됩니다.
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
    <Press
      onPress={() => (selecting ? onToggle?.() : desktop ? openRoom(room.id) : router.push({ pathname: '/room/[id]', params: { id: room.id } }))}
      onLongPress={onToggle}
      scale={0.98}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: 10,
        paddingHorizontal: space.md,
        marginHorizontal: -space.md,
        borderRadius: radius.lg - 2,
        backgroundColor: on ? c.surface : hovered ? c.hover : 'transparent',
      })}>
      {selecting ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: selected ? c.accent : c.faint, backgroundColor: selected ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Pop><Icon name="check" color="#FFFFFF" size={14} /></Pop> : null}
        </View>
      ) : null}
      <View>
        <Avatar name={room.title} size={50} group={group} uri={room.photo ?? (room.kind === 'direct' ? s.users.find((u) => u.id !== user.id && room.memberIds.includes(u.id))?.photo : undefined)} />
        {pinned ? (
          <View style={{ position: 'absolute', left: -4, top: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pin" color={c.accent} size={13} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, ...(unread ? family.bold : family.semibold), fontSize: 16, color: c.text, letterSpacing: -0.2 }}>{roomTitle(room)}</Text>
          {muted ? <Icon name="mute" color={c.faint} size={14} /> : null}
          {room.kind === 'case' ? <ModeBadge mode="private" /> : null}
          <View style={{ marginLeft: 'auto', paddingLeft: space.sm }}>
            <Text style={{ ...family.regular, fontSize: 13, color: unread ? c.accent : c.faint }}>{last ? chatTime(last.at) : ''}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={mentioned ? 1 : 2} style={{ ...family.regular, fontSize: 14, lineHeight: 20, color: unread ? c.text : c.sub }}>{previewText(last, s.users)}</Text>
            {mentioned ? <Text style={{ ...family.semibold, fontSize: 12, color: c.accent }}>나를 불렀습니다</Text> : null}
          </View>
          {unread ? (
            <Bounce keyOf={unread}>
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 }}>
                <Text style={{ color: '#FFFFFF', ...family.bold, fontSize: 11.5 }}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            </Bounce>
          ) : null}
        </View>
      </View>
    </Press>
  );
}
