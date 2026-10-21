import { router, type Href } from 'expo-router';

import { canSeeWorkTab, canUseAgents } from '@/core/rooms';
import { useAx, type R } from '@/ui/axiom';
import { Badge, Card, Empty, Notice, Row, Screen, Section, T } from '@/ui/kit';
import { useMe } from '@/ui/use-app';

const AGENT: { href: Href; title: string; sub: string }[] = [
  { href: '/agent/meeting', title: '회의 정리', sub: '회의 내용을 듣고 결정사항·할 일을 정리합니다' },
  { href: '/agent/knowledge', title: '의견 받기', sub: '지난 결정과 결과를 근거로 찬반과 추가 의견을 냅니다' },
  { href: '/agent/images', title: '자료 이미지 다시 만들기', sub: '예전 차트를 최신 데이터로 같은 모양 그대로' },
  { href: '/agent/builder', title: '프로그램 만들기', sub: '필요한 사내 도구를 말로 요청합니다' },
];

const AXIOM: { href: Href; title: string }[] = [
  { href: '/axiom/council', title: '경영위원회' },
  { href: '/axiom/work', title: '작업지시' },
  { href: '/axiom/doc', title: '저장소' },
  { href: '/axiom/agent', title: '에이전트' },
  { href: '/axiom/ledger', title: '예측 원장' },
  { href: '/axiom/settings', title: '설정' },
];

function AxiomSection() {
  const s = useAx<R>('status').data;
  return (
    <Section title="AXIOM 경영관리">
      <Row title="결재함" right={s?.pending ? <Badge label={`${s.pending}`} /> : undefined} onPress={() => router.push('/axiom')} />
      {AXIOM.map((a) => <Row key={a.title} title={a.title} onPress={() => router.push(a.href)} />)}
    </Section>
  );
}

export default function WorkScreen() {
  const user = useMe();
  if (!canSeeWorkTab(user)) return <Screen title="업무"><Empty text="어드민 계정만 쓸 수 있습니다." /></Screen>;
  const allowed = canUseAgents(user);
  return (
    <Screen title="업무">
      <AxiomSection />
      <Section title="경영 에이전트">
        {allowed ? (
          AGENT.map((a) => (
            <Card key={a.title} onPress={() => router.push(a.href)}>
              <T bold>{a.title}</T>
            </Card>
          ))
        ) : (
          <Notice text="어드민 허용이 필요합니다." />
        )}
      </Section>
      <Section title="마케팅 AI">
        {allowed ? (
          <Card onPress={() => router.push('/marketing')}>
            <T bold>마케팅 지휘실</T>
          </Card>
        ) : (
          <Notice text="어드민 허용이 필요합니다." />
        )}
      </Section>
      {user.role === 'admin' ? (
        <Section title="관리">
          <Card onPress={() => router.push('/backoffice')}>
            <T bold>백오피스</T>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
