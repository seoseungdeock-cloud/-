import { router, type Href } from 'expo-router';

import { canSeeWorkTab, canUseAgents } from '@/core/rooms';
import { useAx, type R } from '@/ui/axiom';
import { Badge, Card, Empty, Notice, Row, Screen, Section, T } from '@/ui/kit';
import { useMe } from '@/ui/use-app';

// 경영관리 (AXIOM + 예전 경영 에이전트를 하나로). 의견 받기는 경영위원회(비판·옹호·판정, 예측 원장 성적)로,
// 프로그램 만들기는 작업지시(개발 팀)로 합쳤습니다.
const MANAGE: { href: Href; title: string; gated?: boolean }[] = [
  { href: '/axiom/council', title: '경영위원회' },
  { href: '/agent/meeting', title: '회의 정리', gated: true },
  { href: '/axiom/work', title: '작업지시' },
  { href: '/axiom/doc', title: '저장소' },
  { href: '/axiom/ledger', title: '예측 원장' },
  { href: '/agent/images', title: '자료 이미지', gated: true },
  { href: '/axiom/agent', title: '에이전트' },
  { href: '/axiom/settings', title: '설정' },
];

function ManageSection({ allowed }: { allowed: boolean }) {
  const s = useAx<R>('status').data;
  return (
    <Section title="경영관리">
      <Row title="결재함" right={s?.pending ? <Badge label={`${s.pending}`} /> : undefined} onPress={() => router.push('/axiom')} />
      {MANAGE.filter((m) => allowed || !m.gated).map((m) => (
        <Row key={m.title} title={m.title} onPress={() => router.push(m.href)} />
      ))}
    </Section>
  );
}

export default function WorkScreen() {
  const user = useMe();
  if (!canSeeWorkTab(user)) return <Screen title="업무"><Empty text="어드민 계정만 쓸 수 있습니다." /></Screen>;
  const allowed = canUseAgents(user);
  return (
    <Screen title="업무">
      <ManageSection allowed={allowed} />
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
