import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import home from '@/data/home.json';
import { OFFICES } from '@/core/offices';
import { actions } from '@/core/store';
import { Button, Input, Notice, Screen } from '@/ui/kit';

// 서류 접수 (변호사 ALL 케어): 접수하면 담당 변호사와 사건방이 바로 열립니다.
export default function ServiceScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const doc = home.documents.find((d) => d.name === name);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string>();
  const lawyers = OFFICES.flatMap((o) => o.lawyers);
  const lawyer = lawyers.find((l) => doc && l.fields.includes(doc.field)) ?? lawyers[0];

  const submit = () => {
    if (!lawyer) return setError('접수할 변호사가 없습니다.');
    const res = actions.requestRetain(lawyer.id, name, summary);
    if (!res.ok) return setError(res.reason);
    router.replace({ pathname: '/room/[id]', params: { id: res.roomId! } });
  };

  return (
    <Screen title={name} back>
      <Input multiline label="내용" placeholder="필요한 내용을 적어 주세요" value={summary} onChangeText={setSummary} />
      {error ? <Notice text={error} /> : null}
      <Button label="접수하기" onPress={submit} />
    </Screen>
  );
}
