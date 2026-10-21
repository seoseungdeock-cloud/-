import { router } from 'expo-router';
import { useState } from 'react';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, useInstance, when, type R } from '@/ui/axiom';
import { Button, Chip, Chips, Empty, Input, Row } from '@/ui/kit';

export default function AxStore() {
  const inst = useInstance();
  const [kind, setKind] = useState<string>();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, error } = useAx<R[]>('docs.list', {
    kind,
    q: search,
    limit: 100,
  });
  return (
    <AgentGate title="저장소">
      <AxScreen title="저장소" error={error} right={<Button label="새 문서" small onPress={() => router.push('/axiom/doc/new')} />}>
        <Input placeholder="검색" value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q.trim())} returnKeyType="search" onBlur={() => setSearch(q.trim())} />
        {inst ? (
          <Chips>
            <Chip label="전체" active={!kind} onPress={() => setKind(undefined)} />
            {Object.entries(inst.kinds as Record<string, string>).map(([k, label]) => (
              <Chip key={k} label={label} active={kind === k} onPress={() => setKind(k)} />
            ))}
          </Chips>
        ) : null}
        {!data ? null : data.length ? (
          data.map((d) => (
            <Row
              key={d.id}
              title={d.title}
              sub={d.snip || `${d.kind_label} · ${when(d.updated_at)} · ${d.visibility_label}`}
              onPress={() =>
                router.push({
                  pathname: '/axiom/doc/[id]',
                  params: { id: d.id },
                })
              }
            />
          ))
        ) : (
          <Empty text="문서가 없습니다." />
        )}
      </AxScreen>
    </AgentGate>
  );
}
