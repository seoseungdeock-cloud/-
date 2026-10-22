import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, useAxAction, useInstance, when, type R } from '@/ui/axiom';
import { Badge, Button, Chip, Chips, Empty, Input, Notice, Row, Section } from '@/ui/kit';

const TONE: Record<string, 'ai' | 'accent' | 'warn' | 'plain'> = {
  running: 'ai',
  queued: 'ai',
  review: 'accent',
  awaiting_approval: 'accent',
  failed: 'warn',
};

export default function AxWork() {
  const { council, team: only } = useLocalSearchParams<{ council?: string; team?: string }>();
  const inst = useInstance();
  const [team, setTeam] = useState<string | undefined>(only);
  const { data, error, reload } = useAx<R[]>(
    'work.list',
    { team, council_id: council },
    {
      poll: (l) => (l.some((w) => w.status === 'running' || w.status === 'queued') ? 3000 : false),
    },
  );
  const [open, setOpen] = useState(!!only);
  const [f, setF] = useState({
    team: only || 'marketing',
    title: '',
    detail: '',
    deliverable: '',
  });
  const act = useAxAction();
  const create = async () => {
    const w = await act.run<R>('work.create', f);
    if (w) {
      setOpen(false);
      setF({ ...f, title: '', detail: '', deliverable: '' });
      void reload();
    }
  };
  return (
    <AgentGate title={only === 'marketing' ? '마케팅팀' : '작업지시'}>
      <AxScreen
        title={only === 'marketing' ? '마케팅팀' : '작업지시'}
        error={error}
        loading={!data}
        right={<Button label={open ? '닫기' : '새 작업'} small kind={open ? 'ghost' : 'primary'} onPress={() => setOpen((v) => !v)} />}
      >
        {open && inst ? (
          <Section title="새 작업지시">
            <Chips>
              {inst.teams
                .filter((t: R) => t.agent)
                .map((t: R) => (
                  <Chip key={t.key} label={t.label} active={f.team === t.key} onPress={() => setF({ ...f, team: t.key })} />
                ))}
            </Chips>
            <Input label="제목" value={f.title} onChangeText={(title) => setF({ ...f, title })} />
            <Input label="내용" multiline value={f.detail} onChangeText={(detail) => setF({ ...f, detail })} />
            <Input label="받을 결과물" value={f.deliverable} onChangeText={(deliverable) => setF({ ...f, deliverable })} />
            {act.error ? <Notice text={act.error} /> : null}
            <Button label="지시하기" disabled={act.busy || !f.title.trim()} onPress={() => void create()} />
          </Section>
        ) : null}
        {inst ? (
          <Chips>
            <Chip label="전체" active={!team} onPress={() => setTeam(undefined)} />
            {inst.teams.map((t: R) => (
              <Chip key={t.key} label={t.label} active={team === t.key} onPress={() => setTeam(t.key)} />
            ))}
          </Chips>
        ) : null}
        {data?.length ? (
          data.map((w) => (
            <Row
              key={w.id}
              title={w.title}
              sub={`${w.team_label} · ${when(w.updated_at)} · ${w.visibility_label}`}
              right={<Badge label={w.status_label} tone={TONE[w.status] ?? 'plain'} />}
              onPress={() =>
                router.push({
                  pathname: '/axiom/work/[id]',
                  params: { id: w.id },
                })
              }
            />
          ))
        ) : (
          <Empty text="작업지시가 없습니다." />
        )}
      </AxScreen>
    </AgentGate>
  );
}
