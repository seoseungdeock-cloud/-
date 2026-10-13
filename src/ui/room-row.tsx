import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { lastMessage, mentionedUnread, notifyLevel, previewText, unreadCount } from '@/core/messenger';
import type { Room } from '@/core/types';
import { Icon } from './icons';
import { Avatar, ModeBadge } from './kit';
import { family, space, useColors } from './theme';
import { useApp, useMe } from './use-app';

/** 오늘이면 '오후 8:47', 아니면 '10월 8일' */
export function chatTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) {
    const h = d.getHours();
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
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
  return (
    <Pressable
      onPress={() => (selecting ? onToggle?.() : router.push({ pathname: '/room/[id]', params: { id: room.id } }))}
      onLongPress={onToggle}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}>
      {selecting ? (
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: selected ? c.accent : c.faint, backgroundColor: selected ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Icon name="check" color="#FFFFFF" size={14} /> : null}
        </View>
      ) : null}
      <View>
        <Avatar name={room.title} size={52} group={group} />
        {pinned ? (
          <View style={{ position: 'absolute', left: -4, top: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pin" color={c.accent} size={13} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: family.bold, fontSize: 16, color: c.text }}>{roomTitle(room)}</Text>
          {muted ? <Icon name="mute" color={c.faint} size={15} /> : null}
          <View style={{ marginLeft: 'auto', paddingLeft: space.sm }}>
            <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.faint }}>{last ? chatTime(last.at) : ''}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={mentioned ? 1 : 2} style={{ fontFamily: family.regular, fontSize: 14, lineHeight: 20, color: c.sub }}>{previewText(last, s.users)}</Text>
            {mentioned ? <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.accent }}>멘션되었습니다.</Text> : null}
          </View>
          {room.mode === 'ai' || room.kind === 'case' ? <ModeBadge mode={room.mode} /> : null}
          {unread ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
              <Text style={{ color: '#FFFFFF', fontFamily: family.bold, fontSize: 12 }}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
