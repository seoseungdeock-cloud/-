import { useState } from 'react';
import { View } from 'react-native';

import { checkCompliance } from '@/core/compliance';
import { CHANNEL_LABEL, DEFAULT_GUARDRAILS, mostSimilar, rankPerformance, type Channel } from '@/core/marketing';
import { actions } from '@/core/store';
import { AgentGate } from '@/ui/agent-gate';
import { Badge, Button, Card, Chip, Chips, Empty, Input, Notice, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp } from '@/ui/use-app';

const TABS = ['지휘', '점검', '콘텐츠', '성과'] as const;

export default function MarketingScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('지휘');
  return (
    <AgentGate title="마케팅 AI">
      <Screen title="마케팅 AI" back>
        <Sub>회의에서 정한 방향을 명령으로 넣으면 계획을 세우고, 승인하면 실행합니다. 네이버 블로그는 기존 자동화 파이프라인이 맡습니다.</Sub>
        <View style={{ height: space.md }} />
        <Chips>
          {TABS.map((t) => <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />)}
        </Chips>
        {tab === '지휘' ? <Command /> : tab === '점검' ? <Check /> : tab === '콘텐츠' ? <Contents /> : <Perf />}
      </Screen>
    </AgentGate>
  );
}

function Command() {
  const s = useApp();
  const [cmd, setCmd] = useState('');
  const [error, setError] = useState<string>();
  return (
    <>
      <Input multiline placeholder="예: 홈페이지 이혼 콘텐츠 5건, 구글 예산 20% 증액" value={cmd} onChangeText={setCmd} />
      <Button label="계획 세우기" disabled={!cmd.trim()} onPress={() => { actions.planCommand(cmd); setCmd(''); }} />
      <Section title="현재 하루 예산">
        {(Object.keys(s.budgets) as Channel[]).map((ch) => (
          <Sub key={ch}>{CHANNEL_LABEL[ch]}: {(s.budgets[ch] ?? 0).toLocaleString('ko-KR')}원 (상한 {(DEFAULT_GUARDRAILS.dailyCap[ch] ?? 0).toLocaleString('ko-KR')}원)</Sub>
        ))}
        <Sub>한 번에 바꿀 수 있는 예산은 최대 {DEFAULT_GUARDRAILS.maxChangePct}%입니다. 광고 계정은 아직 연결되지 않아 앱 안에서만 반영됩니다.</Sub>
      </Section>
      <Section title="계획">
        {error ? <Notice text={error} /> : null}
        {s.plans.length ? s.plans.map((p) => (
          <Card key={p.id}>
            <Badge label={p.status} tone={p.status === '실행됨' ? 'secure' : p.status === '반려' ? 'plain' : 'accent'} />
            <T bold style={{ marginTop: space.xs }}>{p.command}</T>
            {p.steps.map((st, i) => (
              <T key={i}>· {st.kind === 'budget' ? `${CHANNEL_LABEL[st.channel]} 예산 ${st.changePct > 0 ? '+' : ''}${st.changePct}%` : `${CHANNEL_LABEL[st.channel]} '${st.topic}' 콘텐츠 ${st.count}건 작성`}</T>
            ))}
            {p.warnings.map((w) => <Sub key={w}>⚠ {w}</Sub>)}
            {p.status === '승인 대기' && p.steps.length ? (
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                <Button label="승인·실행" small onPress={() => { const r = actions.approvePlan(p.id); setError(r.ok ? undefined : r.reason); }} />
                <Button label="반려" kind="ghost" small onPress={() => actions.rejectPlan(p.id)} />
              </View>
            ) : null}
          </Card>
        )) : <Empty text="아직 계획이 없습니다." />}
      </Section>
    </>
  );
}

function Check() {
  const s = useApp();
  const [text, setText] = useState('');
  const issues = checkCompliance(text);
  const similar = text.trim() ? mostSimilar(text, s.contents) : undefined;
  return (
    <>
      <Sub>발행 전 원고를 넣으면 변호사 광고 규정 위반 소지와 기존 콘텐츠와의 유사도를 바로 봅니다.</Sub>
      <View style={{ height: space.sm }} />
      <Input multiline placeholder="원고 붙여넣기" value={text} onChangeText={setText} />
      {text.trim() ? (
        <>
          <Card>
            <T bold>광고 규정 점검</T>
            {issues.length ? issues.map((i, n) => <T key={n}>· "{i.phrase}" — {i.reason}</T>) : <Sub>문제 표현을 찾지 못했습니다. 최종 판단은 담당 변호사가 합니다.</Sub>}
          </Card>
          <Card>
            <T bold>유사도</T>
            {similar ? (
              <Sub>가장 비슷한 글: "{similar.item.title}" · {Math.round(similar.score * 100)}%{similar.score > 0.5 ? ' (중복 위험, 고쳐 쓰기 권장)' : ''}</Sub>
            ) : <Sub>비교할 콘텐츠가 없습니다.</Sub>}
          </Card>
        </>
      ) : null}
    </>
  );
}

function Contents() {
  const s = useApp();
  return (
    <>
      <Sub>AI가 쓴 초안은 담당자가 확인·승인해야 발행 대기로 넘어갑니다. AI 생성 표시가 자동으로 붙습니다.</Sub>
      {s.contents.map((ct) => {
        const issues = checkCompliance(ct.body);
        return (
          <Card key={ct.id}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Badge label={CHANNEL_LABEL[ct.channel]} tone="plain" />
              <Badge label={ct.status} tone={ct.status === '초안' ? 'accent' : 'secure'} />
              {issues.length ? <Badge label={`규정 확인 ${issues.length}`} tone="warn" /> : null}
            </View>
            <T bold style={{ marginTop: space.xs }}>{ct.title}</T>
            <Sub>{ct.body}</Sub>
            {ct.status === '초안' ? <View style={{ marginTop: space.sm }}><Button label="확인했습니다 (발행 대기로)" kind="soft" small disabled={issues.length > 0} onPress={() => actions.approveContent(ct.id)} /></View> : null}
          </Card>
        );
      })}
    </>
  );
}

function Perf() {
  const s = useApp();
  const ranked = rankPerformance(s.performance);
  return (
    <>
      <Sub>상담 문의로 이어진 비율이 높은 순입니다. 광고 계정이 연결되면 매일 자동으로 모입니다 (지금은 예시 수치).</Sub>
      {ranked.map((r, i) => (
        <Card key={i}>
          <T bold>{i + 1}. {CHANNEL_LABEL[r.channel]} · {r.topic}</T>
          <Sub>비용 {r.spend.toLocaleString('ko-KR')}원 · 클릭 {r.clicks} · 문의 {r.inquiries} · 문의당 {Number.isFinite(r.costPerInquiry) ? `${r.costPerInquiry.toLocaleString('ko-KR')}원` : '-'} · 전환율 {(r.rate * 100).toFixed(1)}%</Sub>
        </Card>
      ))}
    </>
  );
}
