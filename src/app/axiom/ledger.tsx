// 예측 원장: 경영위원회가 낸 예측과 실제 실적
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AgentGate } from '@/ui/agent-gate';
import { AxScreen, pct, useAx, useAxAction, won, type R } from '@/ui/axiom';
import { Badge, Button, Card, Empty, Input, Notice, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';

function Forecast({ f, onDone }: { f: R; onDone: () => void }) {
  const [v, setV] = useState('');
  const [note, setNote] = useState('');
  const { run, busy, error } = useAxAction();
  const save = async () => {
    if (await run('ledger.actual', { id: f.id, actual: v, note })) onDone();
  };
  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          gap: space.xs,
          flexWrap: 'wrap',
          marginBottom: space.xs,
        }}
      >
        {f.due ? <Badge label="실적 입력" tone="accent" /> : null}
        {f.actual != null ? <Badge label={f.in_range ? '범위 안' : '범위 밖'} tone={f.in_range ? 'secure' : 'warn'} /> : null}
        <Badge label={f.visibility === 'org' ? '전체' : f.visibility} tone="plain" />
      </View>
      <T bold>{f.strategy_name}</T>
      <Sub>
        {f.metric}({f.unit}) {f.horizon} · 확인일 {f.check_date || '미정'}
      </Sub>
      <T size="small">
        보수 {won(f.conservative)} · 기준 {won(f.base)} · 낙관 {won(f.optimistic)}
      </T>
      {f.actual != null ? (
        <T size="small" bold>
          실적 {won(f.actual)} · 오차 {pct(f.ape)}
        </T>
      ) : null}
      {f.actual == null ? (
        <View style={{ marginTop: space.sm }}>
          <Input placeholder="실적 (예: 13억)" value={v} onChangeText={setV} />
          <Input placeholder="메모" value={note} onChangeText={setNote} />
          {error ? <Notice text={error} /> : null}
          <Button label="실적 저장" kind="soft" small disabled={busy || !v.trim()} onPress={() => void save()} />
        </View>
      ) : null}
      {f.council_id ? (
        <View style={{ marginTop: space.sm }}>
          <Button
            label="경영위원회 보기"
            kind="ghost"
            small
            onPress={() =>
              router.push({
                pathname: '/axiom/council/[id]',
                params: { id: f.council_id },
              })
            }
          />
        </View>
      ) : null}
    </Card>
  );
}

export default function AxLedger() {
  const { data, error, reload } = useAx<R>('ledger.get');
  const s = data?.summary;
  return (
    <AgentGate title="예측 원장">
      <AxScreen title="예측 원장" error={error} loading={!data}>
        {s ? (
          <Card>
            <T>
              예측 {s.total}건 · 실적 비교 {s.measured}건
            </T>
            <T>
              평균 오차 {pct(s.mape)} · 범위 적중 {pct(s.hit_rate)}
            </T>
            {s.by_model?.map((b: R) => (
              <Sub key={b.model}>
                {b.model}: {b.n}건 · 오차 {pct(b.mape)} · 적중 {pct(b.hit_rate)}
              </Sub>
            ))}
          </Card>
        ) : null}
        {data?.forecasts?.length ? data.forecasts.map((f: R) => <Forecast key={f.id} f={f} onDone={() => void reload()} />) : <Empty text="아직 예측이 없습니다." />}
      </AxScreen>
    </AgentGate>
  );
}
