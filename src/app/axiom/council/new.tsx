import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { parseState } from '@/core/axiom/council';
import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, MockNotice, useAx, useAxAction, useInstance, VisibilityPicker, type R } from '@/ui/axiom';
import { Button, Chip, Chips, Input, Notice, Section, Sub } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function AxCouncilNew() {
  const inst = useInstance();
  return (
    <AgentGate title="경영위원회 열기">
      <AxScreen title="경영위원회 열기" loading={!inst}>
        {inst ? <Form inst={inst} /> : null}
      </AxScreen>
    </AgentGate>
  );
}

function Form({ inst }: { inst: R }) {
  const meetings = useAx<R[]>('docs.list', { kind: 'meeting', limit: 30 }).data;
  const [title, setTitle] = useState('');
  const { meeting } = useLocalSearchParams<{ meeting?: string }>();
  const [meetingId, setMeetingId] = useState<string | undefined>(meeting);
  const [meetingText, setMeetingText] = useState('');
  const [stateText, setStateText] = useState('');
  const [objective, setObjective] = useState('');
  const [vis, setVis] = useState(inst.default_visibility || 'org');
  const preview = useMemo(() => (stateText.trim() ? parseState(stateText) : undefined), [stateText]);
  const { run, busy, error } = useAxAction();

  const start = async () => {
    const c = await run<R>('councils.start', {
      title,
      objective,
      visibility: vis,
      meeting_doc_id: meetingId,
      meeting_text: meetingId ? undefined : meetingText,
      state_text: stateText,
    });
    if (c) router.replace({ pathname: '/axiom/council/[id]', params: { id: c.id } });
  };

  return (
    <>
      <MockNotice />
      <Input label="제목" value={title} onChangeText={setTitle} placeholder="예: 4분기 마케팅 방향" />
      <Section title="회의록">
        {meetings?.length ? (
          <Chips>
            <Chip label="붙여 넣기" active={!meetingId} onPress={() => setMeetingId(undefined)} />
            {meetings.map((d) => (
              <Chip key={d.id} label={d.title} active={meetingId === d.id} onPress={() => setMeetingId(d.id)} />
            ))}
          </Chips>
        ) : null}
        {!meetingId ? <Input multiline value={meetingText} onChangeText={setMeetingText} placeholder={'이름: 발언\n이름: 발언'} /> : null}
      </Section>
      <Section title="회사 상태" right={inst.state_template ? <Button label="양식 넣기" kind="ghost" small onPress={() => setStateText(inst.state_template)} /> : null}>
        <Input multiline value={stateText} onChangeText={setStateText} placeholder={'항목,값,단위\n월 매출,12억,원'} />
        {preview?.metrics?.length ? (
          <View style={{ marginBottom: space.md }}>
            {preview.metrics.map((m: R, i: number) => (
              <Sub key={i}>
                · {m.name}: {String(m.value)} {m.unit}
              </Sub>
            ))}
          </View>
        ) : null}
      </Section>
      <Section title="상태·목적·방향성">
        <Input multiline value={objective} onChangeText={setObjective} />
      </Section>
      <VisibilityPicker value={vis} onChange={setVis} teams={inst.teams} />
      {error ? <Notice text={error} /> : null}
      <Button label={busy ? '여는 중…' : '경영위원회 시작'} disabled={busy || !title.trim()} onPress={() => void start()} />
    </>
  );
}
