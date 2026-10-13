import { useState } from 'react';
import { View } from 'react-native';

import { latest, parseRows } from '@/core/templates';
import { actions } from '@/core/store';
import { AgentGate } from '@/ui/agent-gate';
import { Chart } from '@/ui/chart';
import { Button, Card, Chip, Chips, Input, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp } from '@/ui/use-app';

export default function ImagesScreen() {
  const s = useApp();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', unit: '', rows: '', chart: 'bar' as 'bar' | 'line' });

  return (
    <AgentGate title="자료 이미지">
      <Screen title="자료 이미지 다시 만들기" back>
        <Sub>차트를 그림이 아니라 "데이터 + 모양"으로 저장해 둡니다. 새 숫자만 넣으면 예전과 같은 모양으로 다시 만들어집니다. AI가 연결되면 "작년 그 자료 최신으로"라고 말만 하면 됩니다.</Sub>
        {s.templates.map((t) => {
          const v = latest(t);
          return (
            <Section key={t.id} title={t.name}>
              <Card>
                <Chart rows={v.rows} chart={t.chart} unit={t.unit} />
                <Sub>기준일 {v.at} · 버전 {t.versions.length}개</Sub>
              </Card>
              <Input
                multiline
                label="새 데이터 (한 줄에 '라벨 값')"
                placeholder={v.rows.map((r) => `${r.label} ${r.value}`).join('\n')}
                value={edit[t.id] ?? ''}
                onChangeText={(x) => setEdit((e) => ({ ...e, [t.id]: x }))}
              />
              <Button
                label="최신 데이터로 다시 만들기"
                kind="soft"
                disabled={!parseRows(edit[t.id] ?? '').length}
                onPress={() => {
                  actions.refreshTemplate(t.id, parseRows(edit[t.id] ?? ''));
                  setEdit((e) => ({ ...e, [t.id]: '' }));
                }}
              />
            </Section>
          );
        })}
        <Section title="새 자료 템플릿">
          <Input placeholder="이름 (예: 분야별 수임 건수)" value={form.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} />
          <Input placeholder="단위 (예: 건)" value={form.unit} onChangeText={(unit) => setForm((f) => ({ ...f, unit }))} />
          <Chips>
            <Chip label="막대" active={form.chart === 'bar'} onPress={() => setForm((f) => ({ ...f, chart: 'bar' }))} />
            <Chip label="선" active={form.chart === 'line'} onPress={() => setForm((f) => ({ ...f, chart: 'line' }))} />
          </Chips>
          <Input multiline placeholder={'이혼 40\n상속 25\n형사 18'} value={form.rows} onChangeText={(rows) => setForm((f) => ({ ...f, rows }))} />
          <View style={{ gap: space.sm }}>
            <Button
              label="템플릿 저장"
              disabled={!form.name.trim() || !parseRows(form.rows).length}
              onPress={() => {
                actions.addTemplate(form.name.trim(), form.chart, form.unit.trim(), parseRows(form.rows));
                setForm({ name: '', unit: '', rows: '', chart: 'bar' });
              }}
            />
            <T size="tiny">예전 그림 파일을 템플릿으로 바꾸는 작업은 AI 연결 후 가능합니다.</T>
          </View>
        </Section>
      </Screen>
    </AgentGate>
  );
}
