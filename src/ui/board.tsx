import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { REPORT_REASONS, score, type AuthorView } from '@/core/board';
import type { Attachment, Votes } from '@/core/types';
import { Icon, type IconName } from '@/ui/icons';
import { Avatar, Badge, Button, Chip, Chips } from '@/ui/kit';
import { family, radius, space, useColors } from '@/ui/theme';

// 익명 번호 + (어드민만) 실제 작성자 + 시간. 변호사 게시판은 메신저 프로필(사진·이름·직책)을 보여 줍니다.
export function BoardAuthor({ v, time }: { v: AuthorView; time?: string }) {
  const c = useColors();
  if (v.profile)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Avatar name={v.profile.nickname} uri={v.profile.photo} size={28} />
        <Text numberOfLines={1} style={{ flexShrink: 0, fontFamily: family.bold, fontSize: 14, color: c.text }}>{v.alias}</Text>
        {v.profile.title || v.profile.branch ? <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: family.regular, fontSize: 12, color: c.sub }}>{[v.profile.title, v.profile.branch].filter(Boolean).join(' · ')}</Text> : null}
        {time ? <Text style={{ flexShrink: 0, fontFamily: family.regular, fontSize: 12, color: c.faint }}>· {time}</Text> : null}
      </View>
    );
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

export function fileSize(n?: number): string {
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

// 첨부: 사진은 크게, 파일은 이름·크기 한 줄. onRemove가 있으면 글쓰기 화면의 빼기 버튼.
// 서버에 올라간 첨부는 임시 주소로 열어 크게 보거나 내려받습니다
const canOpen = (a: Attachment) => /^https?:/.test(a.uri);
const openFile = (a: Attachment) => {
  if (canOpen(a)) void WebBrowser.openBrowserAsync(a.uri);
};

export function Attachments({ items, onRemove, compact }: { items: Attachment[]; onRemove?: (id: string) => void; compact?: boolean }) {
  const c = useColors();
  if (!items.length) return null;
  const images = items.filter((a) => a.kind === 'image');
  const files = items.filter((a) => a.kind === 'file');
  const remove = (id: string) =>
    onRemove ? (
      <Pressable accessibilityLabel="첨부 빼기" hitSlop={8} onPress={() => onRemove(id)}>
        <Icon name="close" color={c.sub} size={18} />
      </Pressable>
    ) : null;
  return (
    <View style={{ gap: space.sm, marginVertical: space.sm }}>
      {compact ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {images.map((a) => (
            <View key={a.id}>
              <Image source={{ uri: a.uri }} style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: c.surface }} />
              {onRemove ? (
                <Pressable accessibilityLabel="사진 빼기" onPress={() => onRemove(a.id)} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 2 }}>
                  <Icon name="close" color="#FFFFFF" size={14} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        images.map((a) => (
          <Pressable key={a.id} accessibilityLabel={`사진 ${a.name}`} disabled={!canOpen(a)} onPress={() => openFile(a)}>
            <Image source={a.uri ? { uri: a.uri } : undefined} resizeMode="cover" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: c.surface }} />
          </Pressable>
        ))
      )}
      {files.map((a) => (
        <Pressable key={a.id} accessibilityLabel={`파일 ${a.name}`} disabled={!!onRemove || !canOpen(a)} onPress={() => openFile(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }}>
          <Icon name="file" color={c.sub} size={20} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: family.semibold, fontSize: 14, color: c.text }}>{a.name}</Text>
          <Text style={{ fontFamily: family.regular, fontSize: 12, color: c.faint }}>{fileSize(a.size)}</Text>
          {remove(a.id)}
        </Pressable>
      ))}
    </View>
  );
}
