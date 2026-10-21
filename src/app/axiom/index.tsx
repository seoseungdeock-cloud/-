// AXIOM 결재함: 결재 대기 · 진행 중인 경영위원회 · 실적 입력할 예측
import { router } from 'expo-router';
import { useState } from 'react';

import { AgentGate } from '@/ui/agent-gate';
import { ApprovalCard, AxScreen, MockNotice, useAx, type R } from '@/ui/axiom';
import { Chip, Chips, Empty, Notice, Row, Section } from '@/ui/kit';

export default function AxInbox() {
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const status = useAx<R>('status', {}, { poll: (s) => (s.running?.length ? 4000 : false) });
  const list = useAx<R[]>('approvals.list', {
    status: tab === 'pending' ? 'pending' : 'all',
  });
  const shown = tab === 'pending' ? list.data : list.data?.filter((a) => a.status !== 'pending' && a.status !== 'superseded');
  const ledger = useAx<R>('ledger.get');
  const reload = () => {
    void list.reload();
    void status.reload();
  };
  return (
    <AgentGate title="결재함">
      <AxScreen title="결재함" error={list.error} loading={!list.data}>
        <MockNotice />
        {ledger.data?.summary?.due ? <Notice text={`실적 확인일이 지난 예측 ${ledger.data.summary.due}건`} tone="accent" /> : null}
        {status.data?.running?.length ? (
          <Section title="진행 중">
            {status.data.running.map((c: R) => (
              <Row
                key={c.id}
                title={c.title}
                sub={c.step_label}
                onPress={() =>
                  router.push({
                    pathname: '/axiom/council/[id]',
                    params: { id: c.id },
                  })
                }
              />
            ))}
          </Section>
        ) : null}
        <Section title="결재">
          <Chips>
            <Chip label="대기" active={tab === 'pending'} onPress={() => setTab('pending')} />
            <Chip label="처리됨" active={tab === 'done'} onPress={() => setTab('done')} />
          </Chips>
          {shown?.length ? shown.map((a) => <ApprovalCard key={a.id} a={a} onDone={reload} />) : <Empty text="결재할 일이 없습니다." />}
        </Section>
      </AxScreen>
    </AgentGate>
  );
}
