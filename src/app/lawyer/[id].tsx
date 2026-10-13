import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { findLawyer, formatFee, regionName } from '@/core/offices';
import { actions } from '@/core/store';
import { Badge, Button, Card, Empty, Input, ModeBadge, Notice, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function LawyerScreen() {
  const params = useLocalSearchParams<{ id: string; summary?: string; field?: string }>();
  const l = findLawyer(params.id);
  const [summary, setSummary] = useState(params.summary ?? '');
  const [error, setError] = useState<string>();
  if (!l) return <Screen title="변호사" back><Empty text="정보를 찾을 수 없습니다." /></Screen>;

  const submit = (kind: 'consult' | 'retain') => {
    const res = kind === 'consult' ? actions.requestConsult(l.id, summary) : actions.requestRetain(l.id, params.field ?? '', summary);
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
      <Section title="상담·수임">
        <Input label="어떤 일인지 짧게 적어 주세요 (선택)" multiline value={summary} onChangeText={setSummary} placeholder="예: 이혼 소송을 준비 중입니다" />
        <View style={{ flexDirection: 'row', marginBottom: space.md }}>
          <ModeBadge mode="private" />
        </View>
        {error ? <Notice text={error} /> : null}
        <View style={{ gap: space.sm }}>
          <Button label="상담 신청하기" onPress={() => submit('consult')} />
          <Button label="바로 수임 요청하기" kind="soft" onPress={() => submit('retain')} />
        </View>
      </Section>
    </Screen>
  );
}
