import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { REPORT_REASONS, score, type AuthorView } from '@/core/board';
import type { Votes } from '@/core/types';
import { Icon, type IconName } from '@/ui/icons';
import { Badge, Button, Chip, Chips } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';

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

export function TextButton({ label, onPress, icon, danger }: { label: string; onPress: () => void; icon?: IconName; danger?: boolean }) {
  const c = useColors();
  const color = danger ? c.accent : c.sub;
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Text style={{ fontFamily: family.semibold, fontSize: 13, color }}>{label}</Text>
    </Pressable>
  );
}

// 신고 사유 고르기
export function ReportPanel({ onSubmit, onCancel }: { onSubmit: (reason: string) => void; onCancel: () => void }) {
  const c = useColors();
  const [reason, setReason] = useState('');
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.md, marginVertical: space.sm, gap: space.sm }}>
      <Text style={{ fontFamily: family.bold, fontSize: 14, color: c.text }}>신고 사유</Text>
      <Chips>
        {REPORT_REASONS.map((r) => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}
      </Chips>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
        <Button small label="신고하기" onPress={() => onSubmit(reason)} />
        <TextButton label="취소" onPress={onCancel} />
      </View>
    </View>
  );
}
