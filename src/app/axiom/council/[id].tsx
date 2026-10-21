import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgentGate } from '@/ui/agent-gate';
import { ApprovalCard, AxScreen, Markdown, RunList, useAx, useAxAction, type R } from '@/ui/axiom';
import { Badge, Button, Card, Chip, Chips, Input, Notice, Section, Sub, T } from '@/ui/kit';
import { space, useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

export default function AxCouncil() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const me = useMe();
  const { data: cn, error, reload } = useAx<R>('councils.get', { id }, { poll: (d) => (d.status === 'running' ? 2500 : false) });
  const ap = useAx<R>('approvals.get', { id: cn?.pending_approval_id }, { skip: !cn?.pending_approval_id });
  const act = useAxAction();
  const [note, setNote] = useState('');
  const [from, setFrom] = useState('forecast');
  const [showRuns, setShowRuns] = useState(false);

  const stepIdx = cn ? cn.steps.findIndex((s: R) => s.key === cn.step) : -1;
  const done = cn && cn.status !== 'running' && cn.status !== 'failed' && cn.status !== 'cancelled';
  const after = async (p: Promise<unknown>) => {
    if (await p) void reload();
  };

  return (
    <AgentGate title="경영위원회">
      <AxScreen title={cn?.title ?? '경영위원회'} error={error} loading={!cn}>
        {cn ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: space.xs,
                flexWrap: 'wrap',
                marginBottom: space.md,
              }}
            >
              <Badge label={cn.status_label} tone={cn.status === 'running' ? 'ai' : cn.status === 'awaiting_approval' ? 'accent' : 'plain'} />
              <Badge label={cn.visibility_label} tone="plain" />
            </View>
            {cn.status === 'failed' ? <Notice text={`멈춤: ${cn.error || ''}`} /> : null}
            {cn.warnings?.map((w: string) => (
              <Notice key={w} text={w} />
            ))}
            <Card>
              {cn.steps.map((s: R, i: number) => {
                const state = done || i < stepIdx ? 'done' : i === stepIdx ? cn.status : 'wait';
                return (
                  <View
                    key={s.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.sm,
                      paddingVertical: 3,
                    }}
                  >
                    <T size="small" color={state === 'done' ? c.text : state === 'running' ? c.ai : state === 'wait' ? c.faint : c.warn}>
                      {state === 'done' ? '✓' : state === 'running' ? '●' : state === 'wait' ? '○' : '!'} {i + 1}. {s.label}
                    </T>
                  </View>
                );
              })}
            </Card>
            {ap.data && ap.data.status === 'pending' ? <ApprovalCard a={ap.data} onDone={() => void reload()} /> : null}
            {cn.status === 'approved' ? (
              <Button
                label="작업지시 보기"
                kind="soft"
                onPress={() =>
                  router.push({
                    pathname: '/axiom/work',
                    params: { council: cn.id },
                  })
                }
              />
            ) : null}
            {cn.record_doc_id ? (
              <View style={{ marginTop: space.sm }}>
                <Button
                  label="기록 문서 열기"
                  kind="ghost"
                  small
                  onPress={() =>
                    router.push({
                      pathname: '/axiom/doc/[id]',
                      params: { id: cn.record_doc_id },
                    })
                  }
                />
              </View>
            ) : null}
            <Section title="회의 기록">
              <Markdown text={cn.record_md} />
            </Section>
            <Section title="개입">
              {cn.interventions?.map((x: R, i: number) => (
                <Sub key={i}>
                  · {x.user_name || ''}: {x.text}
                </Sub>
              ))}
              <Input multiline value={note} onChangeText={setNote} placeholder="위원회에 넣을 지시" />
              {act.error ? <Notice text={act.error} /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  gap: space.sm,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  label="지시 넣기"
                  small
                  disabled={!note.trim() || act.busy}
                  onPress={() => void after(act.run('councils.intervene', { id, text: note }).then((r) => (r && setNote(''), r)))}
                />
                {cn.status === 'running' ? (
                  <Button label="진행 중단" kind="ghost" small disabled={act.busy} onPress={() => void after(act.run('councils.cancel', { id }))} />
                ) : null}
              </View>
              {me.superAdmin && cn.status !== 'running' ? (
                <View style={{ marginTop: space.md }}>
                  <Sub>다시 실행할 단계</Sub>
                  <View style={{ height: space.xs }} />
                  <Chips>
                    {cn.steps.map((s: R) => (
                      <Chip key={s.key} label={s.label} active={from === s.key} onPress={() => setFrom(s.key)} />
                    ))}
                  </Chips>
                  <Button label="이 단계부터 다시 실행" kind="soft" small disabled={act.busy} onPress={() => void after(act.run('councils.rerun', { id, from_step: from }))} />
                </View>
              ) : null}
            </Section>
            <Section title="실행 기록" right={<Button label={showRuns ? '접기' : `${cn.runs?.length ?? 0}건 보기`} kind="ghost" small onPress={() => setShowRuns((v) => !v)} />}>
              {showRuns ? <RunList runs={cn.runs} /> : null}
            </Section>
          </>
        ) : null}
      </AxScreen>
    </AgentGate>
  );
}
