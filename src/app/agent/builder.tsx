import { useState } from 'react';

import { actions } from '@/core/store';
import { AgentGate } from '@/ui/agent-gate';
import { Badge, Button, Card, Empty, Input, Notice, Screen, Section, Sub, T } from '@/ui/kit';
import { useApp } from '@/ui/use-app';

export default function BuilderScreen() {
  const s = useApp();
  const [desc, setDesc] = useState('');
  return (
    <AgentGate title="프로그램 만들기">
      <Screen title="프로그램 만들기" back>
        <Sub>필요한 사내 도구를 말로 설명하세요. AI가 격리된 환경에서 만들고, 사람이 확인한 뒤 업무 탭에 추가됩니다.</Sub>
        <Notice text="소형 사내 도구(계산기, 정리표, 양식 생성기 등)에 적합합니다. 큰 시스템은 개발자 검수가 필요합니다." tone="accent" />
        <Input multiline placeholder="예: 사건별 기일을 입력하면 이번 주 일정표를 만들어 주는 도구" value={desc} onChangeText={setDesc} />
        <Button label="요청하기" disabled={!desc.trim()} onPress={() => { actions.requestProgram(desc); setDesc(''); }} />
        <Section title="요청 목록">
          {s.programs.length ? s.programs.map((p) => (
            <Card key={p.id}>
              <Badge label={p.status} tone={p.status === 'AI 연결 대기' ? 'plain' : 'accent'} />
              <T bold>{p.title}</T>
              <Sub>{p.description}</Sub>
            </Card>
          )) : <Empty text="아직 요청이 없습니다." />}
        </Section>
      </Screen>
    </AgentGate>
  );
}
