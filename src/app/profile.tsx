import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PRESENCE } from '@/core/messenger';
import { actions } from '@/core/store';
import type { Presence } from '@/core/types';
import { Icon } from '@/ui/icons';
import { Avatar, Button, Chip, Chips, Input, Notice, Screen, Sub, T } from '@/ui/kit';
import { usePresenceColor } from '@/ui/presence';
import { family, space, useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

// 내 프로필 수정: 사진, 이름, 상태 메시지, 연락처, 생일. 직책·부서·지점은 어드민이 정합니다.
export default function ProfileScreen() {
  const user = useMe();
  const c = useColors();
  const [form, setForm] = useState({
    nickname: user.nickname,
    status: user.status ?? '',
    phone: user.phone ?? '',
    email: user.email ?? '',
    birthday: user.birthday ?? '',
  });
  const [photo, setPhoto] = useState<string | undefined>(user.photo);
  const [presence, setPresence] = useState<Presence>(user.presence ?? 'available');
  const dot = usePresenceColor();
  const [error, setError] = useState('');

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  const save = () => {
    const r = actions.updateProfile({ ...form, presence, photo: photo ?? null });
    if (!r.ok) return setError(r.reason);
    router.back();
  };

  const field = (key: keyof typeof form, label: string, extra: object = {}) => (
    <Input label={label} value={form[key]} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} {...extra} />
  );

  return (
    <Screen
      title="프로필 편집"
      back
      right={
        <Pressable accessibilityLabel="저장" onPress={save} hitSlop={8}>
          <Text style={{ fontFamily: family.bold, fontSize: 16, color: c.accent }}>저장</Text>
        </Pressable>
      }>
      <View style={{ alignItems: 'center', gap: space.sm, marginVertical: space.lg }}>
        <Pressable accessibilityLabel="사진 변경" onPress={pick}>
          <Avatar name={form.nickname || user.nickname} size={96} uri={photo} dot={dot({ ...user, presence })} />
          <View style={{ position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: c.text, borderWidth: 2, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" color={c.bg} size={16} />
          </View>
        </Pressable>
        {photo ? (
          <Pressable onPress={() => setPhoto(undefined)} hitSlop={8}>
            <Text style={{ fontFamily: family.semibold, fontSize: 14, color: c.sub }}>사진 삭제</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Notice text={error} /> : null}
      <Sub>상태</Sub>
      <Chips>
        {PRESENCE.map((p) => (
          <Chip key={p.key} label={p.label} active={presence === p.key} onPress={() => setPresence(p.key)} />
        ))}
      </Chips>
      {field('nickname', '이름')}
      {field('status', '상태 메시지', { placeholder: '예: 오후 재판 중' })}
      {field('phone', '휴대전화', { keyboardType: 'phone-pad' })}
      {field('email', '메일', { keyboardType: 'email-address', autoCapitalize: 'none' })}
      {field('birthday', '생일', { placeholder: '2000-01-31' })}
      {user.title || user.dept || user.branch ? (
        <View style={{ marginTop: space.md, gap: space.xs }}>
          <Sub>직책 · 부서 · 지점</Sub>
          <T>{[user.title, user.dept, user.branch].filter(Boolean).join(' · ')}</T>
        </View>
      ) : null}
      <View style={{ marginTop: space.xl }}>
        <Button label="저장" onPress={save} />
      </View>
    </Screen>
  );
}
