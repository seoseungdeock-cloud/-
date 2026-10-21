import { router } from 'expo-router';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, useInstance, type R } from '@/ui/axiom';
import { Badge, Button, Empty, Row, Section } from '@/ui/kit';

export default function AxAgents() {
  const inst = useInstance();
  const { data, error } = useAx<R[]>('agents.list');
  const teamLabel = (k?: string) => inst?.teams.find((t: R) => t.key === k)?.label ?? '공통';
  const groups: [string, R[]][] = [];
  for (const a of data ?? []) {
    const key = a.origin === 'engine' ? '엔진 기본' : teamLabel(a.team);
    const g = groups.find(([k]) => k === key);
    if (g) g[1].push(a);
    else groups.push([key, [a]]);
  }
  return (
    <AgentGate title="에이전트">
      <AxScreen title="에이전트" error={error} loading={!data} right={<Button label="만들기" small onPress={() => router.push('/axiom/agent/form')} />}>
        {groups.length ? (
          groups.map(([k, list]) => (
            <Section key={k} title={k}>
              {list.map((a) => (
                <Row
                  key={a.id}
                  title={a.name}
                  sub={a.manual?.purpose || a.role || ''}
                  right={<Badge label={`v${a.current_version}`} tone="plain" />}
                  onPress={() =>
                    router.push({
                      pathname: '/axiom/agent/[slug]',
                      params: { slug: a.slug },
                    })
                  }
                />
              ))}
            </Section>
          ))
        ) : (
          <Empty text="에이전트가 없습니다." />
        )}
      </AxScreen>
    </AgentGate>
  );
}
