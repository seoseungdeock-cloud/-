import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Icon } from '@/ui/icons';
import { Chip, Chips, Empty, Screen } from '@/ui/kit';
import { RoomRow } from '@/ui/room-row';
import { useColors } from '@/ui/theme';
import { useApp } from '@/ui/use-app';
import { useState } from 'react';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'e2ee', label: '🔒 암호화방' },
  { key: 'ai', label: '✦ AI 참여방' },
] as const;

export default function ChatsScreen() {
  const s = useApp();
  const c = useColors();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const rooms = s.rooms.filter(
    (r) => r.memberIds.includes(s.currentUserId) && r.kind !== 'case' && r.kind !== 'consult' && (filter === 'all' || r.mode === filter),
  );
  return (
    <Screen
      title="대화"
      right={
        <Pressable accessibilityLabel="새 대화" onPress={() => router.push('/room/new')} hitSlop={12}>
          <Icon name="plus" color={c.text} size={28} />
        </Pressable>
      }>
      <Chips>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </Chips>
      {rooms.length ? rooms.map((r) => <RoomRow key={r.id} room={r} />) : <Empty text="대화가 없습니다. + 를 눌러 시작하세요." />}
    </Screen>
  );
}
