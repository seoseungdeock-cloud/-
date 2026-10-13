import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { findLawyer, formatFee, regionName } from '@/core/offices';
import { ROOM_MODE_INFO } from '@/core/rooms';
import { actions } from '@/core/store';
import type { RoomMode } from '@/core/types';
import { Badge, Button, Card, Chip, Chips, Empty, Input, ModeBanner, Notice, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function LawyerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const l = findLawyer(id);
  const [summary, setSummary] = useState('');
  const [mode, setMode] = useState<RoomMode>('ai');
  const [error, setError] = useState<string>();
  if (!l) return <Screen title="변호사" back><Empty text="정보를 찾을 수 없습니다." /></Screen>;

  const submit = () => {
    const res = actions.requestConsult(l.id, summary, mode);
    if (!res.ok) return setError(res.reason);
    router.replace({ pathname: '/room/[id]', params: { id: res.roomId! } });
  };

  return (
    <Screen title={l.name} back>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {l.fields.map((f) => <Badge key={f} label={f} />)}
        {l.office.sample ? <Badge label="샘플" tone="plain" /> : null}
      </View>
      <Card style={{ marginTop: space.md }}>
        <T>{l.intro}</T>
        <Sub>경력 {l.careerYears}년 · {formatFee(l.consultFee)}</Sub>
      </Card>
      <Section title="사무소">
        <T bold>{l.office.name}</T>
        <Sub>{regionName(l.office.regionCode)} · {l.office.address}</Sub>
        <Sub>{l.office.phone}</Sub>
      </Section>
      <Section title="상담 신청">
        <Input label="어떤 일인지 짧게 적어 주세요 (선택)" multiline value={summary} onChangeText={setSummary} placeholder="예: 이혼 소송을 준비 중입니다" />
        <Sub>상담방 방식</Sub>
        <Chips>
          {(['ai', 'e2ee'] as RoomMode[]).map((m) => (
            <Chip key={m} label={ROOM_MODE_INFO[m].label} active={mode === m} onPress={() => setMode(m)} />
          ))}
        </Chips>
        <ModeBanner mode={mode} />
        <View style={{ height: space.md }} />
        {error ? <Notice text={error} /> : null}
        <Button label="상담 신청하기" onPress={submit} />
        <View style={{ marginTop: space.sm }}>
          <Sub>수임료는 상담 후 변호사와 직접 정합니다. 라잇나우는 수임료를 받거나 정하지 않습니다.</Sub>
        </View>
      </Section>
    </Screen>
  );
}
