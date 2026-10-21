// AXIOM 설정: AI 연결 상태, 이번 달 사용액, 정기 보고, 감사 기록
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, useAx, useAxAction, useInstance, when, type R } from '@/ui/axiom';
import { Badge, Button, Card, Chip, Chips, Input, Notice, Row, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

export default function AxSettings() {
  const me = useMe();
  const inst = useInstance();
  const status = useAx<R>('status');
  const scheds = useAx<R[]>('schedules.list');
  const audit = useAx<R[]>('audit.list', {}, { skip: !me.superAdmin });
  const act = useAxAction();
  const [f, setF] = useState({ name: '', team: '', spec: 'weekdays 18:00' });
  const [msg, setMsg] = useState<string>();
  const [showAudit, setShowAudit] = useState(false);
  const s = status.data;

  const add = async () => {
    if (await act.run('schedules.create', { ...f, team: f.team || null })) {
      setF({ ...f, name: '' });
      void scheds.reload();
    }
  };
  const runNow = async (id: string) => {
    const r = await act.run<R>('schedules.run', { id });
    if (!r) return;
    if (r.skipped) setMsg(r.reason);
    else if (r.doc_id) router.push({ pathname: '/axiom/doc/[id]', params: { id: r.doc_id } });
  };
  const toggle = async (x: R) => {
    if (await act.run('schedules.toggle', { id: x.id, enabled: !x.enabled })) void scheds.reload();
  };

  return (
    <AgentGate title="AXIOM 설정">
      <AxScreen title="AXIOM 설정" error={status.error} loading={!s}>
        {s ? (
          <Section title="AI 연결">
            <Card>
              {s.providers.map((p: R) => (
                <View
                  key={p.key}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 3,
                  }}
                >
                  <T>{p.label}</T>
                  <Badge label={p.connected ? '연결됨' : '키 없음'} tone={p.connected ? 'secure' : 'plain'} />
                </View>
              ))}
              <Sub>
                이번 달 사용액 ${Number(s.month_usd || 0).toFixed(2)}
                {s.budget_usd ? ` / $${s.budget_usd}` : ''}
              </Sub>
            </Card>
          </Section>
        ) : null}
        <Section title="정기 보고">
          {(scheds.data ?? []).map((x) => (
            <Card key={x.id}>
              <T bold>{x.name}</T>
              <Sub>
                {x.label} · {x.team_label} · 마지막 {x.last_run_at ? when(x.last_run_at) : '없음'}
              </Sub>
              {me.superAdmin ? (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: space.sm,
                    marginTop: space.sm,
                  }}
                >
                  <Button label="지금 보고" kind="soft" small disabled={act.busy} onPress={() => void runNow(x.id)} />
                  <Button label={x.enabled ? '끄기' : '켜기'} kind="ghost" small disabled={act.busy} onPress={() => void toggle(x)} />
                </View>
              ) : null}
            </Card>
          ))}
          {msg ? <Notice text={msg} tone="accent" /> : null}
          {me.superAdmin && inst ? (
            <View style={{ marginTop: space.sm }}>
              <Input label="이름" value={f.name} onChangeText={(name) => setF({ ...f, name })} placeholder="예: 일일 업무 보고" />
              <Input label="주기" autoCapitalize="none" value={f.spec} onChangeText={(spec) => setF({ ...f, spec })} placeholder="daily 18:00 · weekdays 18:00 · weekly 월 09:00" />
              <Chips>
                <Chip label="전체" active={!f.team} onPress={() => setF({ ...f, team: '' })} />
                {inst.teams.map((t: R) => (
                  <Chip key={t.key} label={t.label} active={f.team === t.key} onPress={() => setF({ ...f, team: t.key })} />
                ))}
              </Chips>
              <Button label="보고 일정 추가" small disabled={act.busy || !f.name.trim()} onPress={() => void add()} />
            </View>
          ) : null}
          {act.error ? <Notice text={act.error} /> : null}
        </Section>
        {me.superAdmin ? (
          <Section title="감사 기록" right={<Button label={showAudit ? '접기' : '보기'} kind="ghost" small onPress={() => setShowAudit((v) => !v)} />}>
            {showAudit
              ? (audit.data ?? []).slice(0, 100).map((a) => <Row key={a.id} title={a.action} sub={`${a.user_name || '시스템'} · ${when(a.at)} · ${a.detail || ''}`} />)
              : null}
          </Section>
        ) : null}
      </AxScreen>
    </AgentGate>
  );
}
