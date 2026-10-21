import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, RunList, useAx, useAxAction, when, type R } from '@/ui/axiom';
import { Badge, Button, Card, Input, Notice, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function AxWorkOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    data: w,
    error,
    reload,
  } = useAx<R>(
    'work.get',
    { id },
    {
      poll: (d) => (d.status === 'running' || d.status === 'queued' ? 2500 : false),
    },
  );
  const act = useAxAction();
  const [instruction, setInstruction] = useState('');
  const again = async () => {
    if (await act.run('work.run', { id, instruction })) {
      setInstruction('');
      void reload();
    }
  };
  return (
    <AgentGate title="작업지시">
      <AxScreen title={w?.title ?? '작업지시'} error={error} loading={!w}>
        {w ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: space.xs,
                flexWrap: 'wrap',
                marginBottom: space.md,
              }}
            >
              <Badge label={w.status_label} tone={w.status === 'running' ? 'ai' : w.status === 'failed' ? 'warn' : 'plain'} />
              <Badge label={w.team_label} tone="plain" />
              <Badge label={w.visibility_label} tone="plain" />
              {w.tier_label ? <Badge label={w.tier_label} tone="plain" /> : null}
            </View>
            <Card>
              {w.detail ? <T>{w.detail}</T> : null}
              {w.deliverable ? <Sub>결과물: {w.deliverable}</Sub> : null}
              <Sub>
                {when(w.created_at)} 지시 · {when(w.updated_at)} 갱신
              </Sub>
            </Card>
            {w.deliverable_doc_id ? (
              <Button
                label="결과물 열기"
                kind="soft"
                onPress={() =>
                  router.push({
                    pathname: '/axiom/doc/[id]',
                    params: { id: w.deliverable_doc_id },
                  })
                }
              />
            ) : null}
            {w.council_id ? (
              <View style={{ marginTop: space.sm }}>
                <Button
                  label="경영위원회 보기"
                  kind="ghost"
                  small
                  onPress={() =>
                    router.push({
                      pathname: '/axiom/council/[id]',
                      params: { id: w.council_id },
                    })
                  }
                />
              </View>
            ) : null}
            {w.notes?.length ? (
              <Section title="메모">
                {w.notes.map((n: R, i: number) => (
                  <Sub key={i}>· {typeof n === 'string' ? n : `${n.by || ''}: ${n.text || ''}`}</Sub>
                ))}
              </Section>
            ) : null}
            {w.status !== 'running' && w.status !== 'queued' && w.status !== 'awaiting_approval' ? (
              <Section title="다시 수행">
                <Input multiline value={instruction} onChangeText={setInstruction} placeholder="추가 지시" />
                {act.error ? <Notice text={act.error} /> : null}
                <Button label="다시 수행" kind="soft" disabled={act.busy} onPress={() => void again()} />
              </Section>
            ) : null}
            <Section title="실행 기록">
              <RunList runs={w.runs} />
            </Section>
          </>
        ) : null}
      </AxScreen>
    </AgentGate>
  );
}
