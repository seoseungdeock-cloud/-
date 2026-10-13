import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { allFields, formatFee, searchLawyers } from '@/core/offices';
import { Avatar, Chip, Chips, Empty, Input, Row, Screen, Section } from '@/ui/kit';

// 변호사 추천받기: 분야와 상황을 적으면 해당 분야 변호사를 보여주고, 고르면 상담·수임으로 이어집니다.
export default function RecommendScreen() {
  const [field, setField] = useState<string>();
  const [summary, setSummary] = useState('');
  const rows = useMemo(() => (field ? searchLawyers({ field, sort: 'career' }) : []), [field]);
  return (
    <Screen title="변호사 추천받기" back>
      <Section title="분야">
        <Chips>
          {allFields().map((f) => <Chip key={f} label={f} active={field === f} onPress={() => setField(f)} />)}
        </Chips>
      </Section>
      <Section title="상황">
        <Input multiline placeholder="어떤 일인지 적어 주세요" value={summary} onChangeText={setSummary} />
      </Section>
      {field ? (
        <Section title={`${field} 변호사 ${rows.length}명`}>
          {rows.length ? rows.map((l) => (
            <Row
              key={l.id}
              left={<Avatar name={l.name} />}
              title={l.name}
              sub={`${l.office.name} · 경력 ${l.careerYears}년 · ${formatFee(l.consultFee)}`}
              onPress={() => router.push({ pathname: '/lawyer/[id]', params: { id: l.id, summary, field } })}
            />
          )) : <Empty text="해당 분야 변호사가 없습니다." />}
        </Section>
      ) : null}
    </Screen>
  );
}
