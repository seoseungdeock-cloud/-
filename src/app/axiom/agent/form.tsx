// 에이전트 만들기 · 고치기 (slug 가 있으면 고치기 = 새 버전)
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, useAxAction, useInstance, type R } from '@/ui/axiom';
import { Button, Chip, Chips, Input, Notice, Section, Sub } from '@/ui/kit';

const MODELS = [
  ['tier:economy', '빠름'],
  ['tier:balanced', '보통'],
  ['tier:best', '최고'],
];

export default function AxAgentForm() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const inst = useInstance();
  const a = useAx<R>('agents.get', { slug }, { skip: !slug }).data;
  const title = slug ? '에이전트 고치기' : '에이전트 만들기';
  return (
    <AgentGate title={title}>
      <AxScreen title={title} loading={!inst || (!!slug && !a)}>
        {inst ? (
          <Form
            slug={slug}
            inst={inst}
            initial={
              a
                ? {
                    slug: a.slug,
                    name: a.name,
                    team: a.team,
                    prompt: a.v.prompt,
                    model: a.v.model,
                    manual: a.v.manual || {},
                    change_note: '',
                  }
                : {
                    slug: '',
                    name: '',
                    team: 'management',
                    prompt: '',
                    model: 'tier:balanced',
                    manual: {},
                    change_note: '',
                  }
            }
          />
        ) : null}
      </AxScreen>
    </AgentGate>
  );
}

function Form({ slug, inst, initial }: { slug?: string; inst: R; initial: R }) {
  const [f, setF] = useState<R>(initial);
  const { run, busy, error } = useAxAction();
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const setManual = (k: string) => (v: string) => setF((x) => ({ ...x, manual: { ...x.manual, [k]: v } }));
  const save = async () => {
    const r = slug ? await run<R>('agents.update', { ...f, slug }) : await run<R>('agents.create', f);
    if (r)
      router.replace({
        pathname: '/axiom/agent/[slug]',
        params: { slug: r.slug },
      });
  };
  return (
    <>
      {!slug ? <Input label="식별자 (영문 소문자·숫자·-)" autoCapitalize="none" value={f.slug} onChangeText={set('slug')} /> : null}
      <Input label="이름" value={f.name} onChangeText={set('name')} />
      {!slug ? (
        <Chips>
          {inst.teams.map((t: R) => (
            <Chip key={t.key} label={t.label} active={f.team === t.key} onPress={() => set('team')(t.key)} />
          ))}
        </Chips>
      ) : null}
      <Input label="역할 지시문" multiline value={f.prompt} onChangeText={set('prompt')} style={{ minHeight: 160 }} />
      <Sub>모델</Sub>
      <Chips>
        {(MODELS.some(([k]) => k === f.model) ? MODELS : [...MODELS, [f.model, f.model]]).map(([k, l]) => (
          <Chip key={k} label={l} active={f.model === k} onPress={() => set('model')(k)} />
        ))}
      </Chips>
      <Section title="사용 설명서">
        {(inst.manual_fields ?? []).map((m: R) => (
          <Input
            key={m.key}
            label={`${m.label} (${[...String(f.manual[m.key] || '')].length}/${m.min}자 이상)`}
            multiline
            value={f.manual[m.key] || ''}
            onChangeText={setManual(m.key)}
          />
        ))}
      </Section>
      {slug ? <Input label="변경 메모" value={f.change_note} onChangeText={set('change_note')} /> : null}
      {error ? <Notice text={error} /> : null}
      <Button label={busy ? '저장 중…' : '저장'} disabled={busy} onPress={() => void save()} />
    </>
  );
}
