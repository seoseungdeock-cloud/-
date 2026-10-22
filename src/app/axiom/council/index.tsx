import { router } from 'expo-router';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, when, type R } from '@/ui/axiom';
import { Badge, Button, Empty, Row } from '@/ui/kit';

export default function AxCouncils() {
  const { data, error } = useAx<R[]>('councils.list', {}, { poll: (l) => (l.some((c) => c.status === 'running') ? 4000 : false) });
  return (
    <AgentGate title="경영위원회">
      <AxScreen title="경영위원회" error={error} loading={!data} right={<Button label="새 카테고리" small onPress={() => router.push('/axiom/council/new')} />}>
        {data?.length ? (
          data.map((c) => (
            <Row
              key={c.id}
              title={c.title}
              sub={`${c.round > 1 ? `${c.round}차 · ` : ''}${when(c.updated_at || c.created_at)} · ${c.created_by_name || ''} · ${c.visibility_label}`}
              right={
                <Badge
                  label={c.status === 'running' ? c.step_label : c.status_label}
                  tone={c.status === 'running' ? 'ai' : c.status === 'awaiting_approval' ? 'accent' : 'plain'}
                />
              }
              onPress={() =>
                router.push({
                  pathname: '/axiom/council/[id]',
                  params: { id: c.id },
                })
              }
            />
          ))
        ) : (
          <Empty text="아직 연 경영위원회가 없습니다." />
        )}
      </AxScreen>
    </AgentGate>
  );
}
