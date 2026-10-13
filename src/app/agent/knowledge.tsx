import { useState } from 'react';
import { View } from 'react-native';

import { opinionFor, type Opinion } from '@/core/knowledge';
import { actions } from '@/core/store';
import { AgentGate } from '@/ui/agent-gate';
import { Badge, Button, Card, Input, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp } from '@/ui/use-app';

export default function KnowledgeScreen() {
  const s = useApp();
  const [proposal, setProposal] = useState('');
  const [op, setOp] = useState<Opinion>();
  const [outcome, setOutcome] = useState<Record<string, string>>({});

  return (
    <AgentGate title="의견 받기">
      <Screen title="의견 받기" back>
        <Sub>새 안건을 적으면 지난 결정과 그 결과를 근거로 찬반과 추가 의견을 냅니다. 결과를 기록할수록 정확해집니다.</Sub>
        <Section title="새 안건">
          <Input multiline placeholder="예: 검색광고 이혼 키워드 예산을 더 늘리자" value={proposal} onChangeText={setProposal} />
          <Button label="의견 받기" disabled={!proposal.trim()} onPress={() => setOp(opinionFor(s.decisions, proposal))} />
          {op ? (
            <Card style={{ marginTop: space.md }}>
              <Badge label={op.stance} tone={op.stance === '찬성' ? 'secure' : op.stance === '반대' ? 'warn' : 'plain'} />
              {op.reasons.map((r) => <T key={r} style={{ marginTop: space.xs }}>· {r}</T>)}
              <Sub>AI가 연결되면 근거에 더해 추가 제안(+α)을 냅니다.</Sub>
            </Card>
          ) : null}
        </Section>
        <Section title={`쌓인 결정 ${s.decisions.length}건`}>
          {s.decisions.map((d) => (
            <Card key={d.id}>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <Sub>{d.date}</Sub>
                {d.verdict ? <Badge label={d.verdict === 'good' ? '좋았음' : '아쉬웠음'} tone={d.verdict === 'good' ? 'secure' : 'warn'} /> : <Badge label="결과 미기록" tone="plain" />}
              </View>
              <T bold>{d.decision}</T>
              {d.outcome ? <Sub>결과: {d.outcome}</Sub> : (
                <View style={{ marginTop: space.sm }}>
                  <Input placeholder="결과 기록" value={outcome[d.id] ?? ''} onChangeText={(v) => setOutcome((o) => ({ ...o, [d.id]: v }))} />
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Button label="좋았음" kind="soft" small onPress={() => actions.recordOutcome(d.id, outcome[d.id] ?? '', 'good')} />
                    <Button label="아쉬웠음" kind="soft" small onPress={() => actions.recordOutcome(d.id, outcome[d.id] ?? '', 'bad')} />
                  </View>
                </View>
              )}
            </Card>
          ))}
        </Section>
      </Screen>
    </AgentGate>
  );
}
