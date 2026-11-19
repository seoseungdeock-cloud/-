// 백오피스 '회의실·설비': 캘린더에서 예약할 수 있는 회의실 목록 (어드민)
import { useState } from 'react';
import { View } from 'react-native';
import { useWork, work, type Resource } from '@/core/work';
import { Badge, Button, Card, Chip, Chips, Input, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export function ResourcesSection({ report }: { report: (r: { ok: boolean; reason?: string }, okText: string) => void }) {
  const w = useWork();
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [capacity, setCapacity] = useState('');
  const add = async () => {
    const r = await work.saveResource({ name, kind: 'room', branch: branch.trim() || undefined, capacity: Number(capacity) || undefined, active: true });
    report(r, `회의실 「${name.trim()}」을 추가했습니다.`);
    if (r.ok) { setName(''); setBranch(''); setCapacity(''); }
  };
  const toggle = (r: Resource) => void work.saveResource({ ...r, active: !r.active }).then((x) => report(x, `「${r.name}」 ${r.active ? '예약 중지' : '예약 다시 열림'}`));
  return (
    <View style={{ marginTop: space.md }}>
      <Card>
        <T bold>회의실 추가</T>
        <Sub>캘린더에서 일정을 만들 때 고를 수 있는 회의실입니다. 같은 시간에 두 번 예약되지 않게 서버가 막습니다.</Sub>
        <View style={{ height: space.sm }} />
        <Input placeholder="이름 (예: 본사 대회의실)" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 2 }}><Input placeholder="지점 (예: 본사(여의도))" value={branch} onChangeText={setBranch} /></View>
          <View style={{ flex: 1 }}><Input placeholder="정원" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" /></View>
        </View>
        <Button label="추가" disabled={!name.trim()} onPress={() => void add()} />
      </Card>
      <Sub>회의실 {w.resources.length}곳</Sub>
      <View style={{ height: space.sm }} />
      {w.resources.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <T bold>{r.name}</T>
              <Sub>{[r.branch, r.capacity ? `${r.capacity}명` : ''].filter(Boolean).join(' · ') || '지점·정원 미지정'}</Sub>
            </View>
            {r.active ? <Badge label="예약 가능" tone="secure" /> : <Badge label="중지" tone="plain" />}
          </View>
          <View style={{ height: space.sm }} />
          <Chips><Chip label={r.active ? '예약 중지' : '다시 열기'} onPress={() => toggle(r)} /></Chips>
        </Card>
      ))}
    </View>
  );
}
