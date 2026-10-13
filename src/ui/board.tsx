import { Pressable, Text, View } from 'react-native';

import { score, type AuthorView } from '@/core/board';
import type { Votes } from '@/core/types';
import { Icon } from '@/ui/icons';
import { Badge } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';

// 익명 번호 + (어드민만) 실제 작성자 + 시간
export function BoardAuthor({ v, time }: { v: AuthorView; time?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' }}>
      <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.sub }}>{v.alias}</Text>
      {v.real ? <Badge label={`작성자 ${v.real}`} tone="warn" /> : null}
      {time ? <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.faint }}>· {time}</Text> : null}
    </View>
  );
}

// 추천 / 비추천 (레딧식). vertical은 글 목록 왼쪽 열.
export function VoteBar({ votes, userId, onVote, vertical }: { votes: Votes; userId: string; onVote: (v: 1 | -1) => void; vertical?: boolean }) {
  const c = useColors();
  const mine = votes[userId];
  const n = score(votes);
  return (
    <View style={{ flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: vertical ? 0 : space.xs }}>
      <Pressable accessibilityLabel="추천" onPress={() => onVote(1)} hitSlop={8}>
        <Icon name="up" size={vertical ? 22 : 18} color={mine === 1 ? c.accent : c.faint} />
      </Pressable>
      <Text style={{ fontFamily: family.bold, fontSize: vertical ? 14 : 13, color: mine === 1 ? c.accent : mine === -1 ? c.sub : c.text, minWidth: 18, textAlign: 'center' }}>{n}</Text>
      <Pressable accessibilityLabel="비추천" onPress={() => onVote(-1)} hitSlop={8}>
        <Icon name="down" size={vertical ? 22 : 18} color={mine === -1 ? c.sub : c.faint} />
      </Pressable>
    </View>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={{ fontFamily: family.semibold, fontSize: 13, color: c.sub }}>{label}</Text>
    </Pressable>
  );
}
