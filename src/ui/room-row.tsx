import { router } from 'expo-router';

import { ROOM_KIND_LABEL } from '@/core/rooms';
import type { Room } from '@/core/types';
import { Avatar, ModeBadge, Row } from './kit';
import { useApp } from './use-app';

export function RoomRow({ room }: { room: Room }) {
  const s = useApp();
  const last = [...s.messages].reverse().find((m) => m.roomId === room.id);
  const preview = room.mode === 'e2ee' && last?.kind !== 'system' ? '암호화된 메시지' : (last?.text.split('\n')[0] ?? '');
  return (
    <Row
      left={<Avatar name={room.title} />}
      title={room.title}
      sub={`${ROOM_KIND_LABEL[room.kind]} · ${preview}`}
      right={<ModeBadge mode={room.mode} />}
      onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })}
    />
  );
}
