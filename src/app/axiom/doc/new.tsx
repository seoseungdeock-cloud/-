// 새 문서 · 고치기 (id 가 있으면 고치기)
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, useAxAction, useInstance, VisibilityPicker, type R } from '@/ui/axiom';
import { Button, Chip, Chips, Input, Notice } from '@/ui/kit';

const LOCKED = ['conversation', 'council'];

export default function AxDocForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const inst = useInstance();
  const doc = useAx<R>('docs.get', { id }, { skip: !id }).data;
  const title_ = id ? '문서 고치기' : '새 문서';
  return (
    <AgentGate title={title_}>
      <AxScreen title={title_} loading={!inst || (!!id && !doc)}>
        {inst ? <Form id={id} inst={inst} doc={doc} /> : null}
      </AxScreen>
    </AgentGate>
  );
}

function Form({ id, inst, doc }: { id?: string; inst: R; doc?: R }) {
  const [kind, setKind] = useState(doc?.kind ?? 'note');
  const [title, setTitle] = useState(doc?.title ?? '');
  const [body, setBody] = useState(doc?.body ?? '');
  const [vis, setVis] = useState(doc?.visibility ?? inst.default_visibility ?? 'org');
  const { run, busy, error } = useAxAction();

  const save = async () => {
    const d = id
      ? await run<R>('docs.update', {
          id,
          title,
          visibility: vis,
          ...(LOCKED.includes(kind) ? {} : { body }),
        })
      : await run<R>('docs.create', { kind, title, body, visibility: vis });
    if (d) router.replace({ pathname: '/axiom/doc/[id]', params: { id: d.id } });
  };

  return (
    <>
      {!id ? (
        <Chips>
          {Object.entries(inst.kinds as Record<string, string>)
            .filter(([k]) => !LOCKED.includes(k))
            .map(([k, label]) => (
              <Chip key={k} label={label} active={kind === k} onPress={() => setKind(k)} />
            ))}
        </Chips>
      ) : null}
      <Input label="제목" value={title} onChangeText={setTitle} />
      {LOCKED.includes(kind) ? null : <Input label="본문" multiline value={body} onChangeText={setBody} style={{ minHeight: 240 }} />}
      <VisibilityPicker value={vis} onChange={setVis} teams={inst.teams} />
      {error ? <Notice text={error} /> : null}
      <Button label={busy ? '저장 중…' : '저장'} disabled={busy || !title.trim()} onPress={() => void save()} />
    </>
  );
}
