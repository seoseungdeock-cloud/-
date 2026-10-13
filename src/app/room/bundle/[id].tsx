import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList } from 'react-native';

import { dayKey } from '@/core/messenger';
import type { Message, Room } from '@/core/types';
import { Bubble, DayDivider } from '@/ui/chat';
import { Empty, Screen } from '@/ui/kit';
import { useApp, useMe } from '@/ui/use-app';

type Item = Message | { id: string; day: string };

// 묶어서 전달된 메시지 상세보기: 고른 말풍선만 대화창처럼 보여 줍니다.
export default function BundleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp();
  const user = useMe();
  const m = s.messages.find((x) => x.id === id);
  const room = m ? s.rooms.find((r) => r.id === m.roomId) : undefined;
  const bundle = m?.bundle && room?.memberIds.includes(user.id) ? m.bundle : undefined;

  const items = useMemo<Item[]>(() => {
    if (!bundle) return [];
    const out: Item[] = [];
    let last = '';
    bundle.items.forEach((it, i) => {
      const k = dayKey(it.at);
      if (k !== last) out.push({ id: `__day_${k}_${i}`, day: it.at });
      last = k;
      out.push({ id: `${id}_${i}`, roomId: '', senderId: it.senderId, kind: 'text', text: it.text, at: it.at });
    });
    return out;
  }, [bundle, id]);

  if (!bundle) return <Screen title="전달" back><Empty text="메시지를 찾을 수 없습니다." /></Screen>;
  // 읽음 수를 세지 않도록 멤버 없는 방으로 그립니다.
  const view: Room = { id: '', kind: 'group', mode: 'private', title: bundle.title, memberIds: [...new Set(bundle.items.map((i) => i.senderId))], createdBy: '', createdAt: '' };

  return (
    <Screen title={`[전달] ${bundle.title}`} back scroll={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) =>
          'day' in item ? (
            <DayDivider at={item.day} />
          ) : (
            <Bubble m={item} me={user} room={view} users={s.users} reads={{}} messages={[]} onLongPress={() => undefined} />
          )
        }
      />
    </Screen>
  );
}
