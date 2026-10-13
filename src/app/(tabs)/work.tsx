import { router, type Href } from 'expo-router';

import { getAi } from '@/core/ai';
import { canUseAgents, isWorkUser } from '@/core/rooms';
import { Badge, Card, Empty, Notice, Screen, Section, Sub, T } from '@/ui/kit';
import { useMe } from '@/ui/use-app';

const AGENT: { href: Href; title: string; sub: string }[] = [
  { href: '/agent/meeting', title: '회의 정리', sub: '회의 내용을 듣고 결정사항·할 일을 정리합니다' },
  { href: '/agent/knowledge', title: '의견 받기', sub: '지난 결정과 결과를 근거로 찬반과 추가 의견을 냅니다' },
  { href: '/agent/images', title: '자료 이미지 다시 만들기', sub: '예전 차트를 최신 데이터로 같은 모양 그대로' },
  { href: '/agent/builder', title: '프로그램 만들기', sub: '필요한 사내 도구를 말로 요청합니다' },
];

export default function WorkScreen() {
  const user = useMe();
  const ai = getAi();
  if (!isWorkUser(user)) return <Screen title="업무"><Empty text="로펌 구성원만 쓸 수 있습니다." /></Screen>;
  const allowed = canUseAgents(user);
  return (
    <Screen title="업무">
      {!ai.connected ? <Notice text="AI가 아직 연결되지 않았습니다. 화면과 흐름은 모두 동작하고, AI 답변 자리에는 '미연결' 표시가 나옵니다." tone="accent" /> : null}
      <Section title="경영 에이전트" right={<Badge label="어드민 허용자 전용" tone="plain" />}>
        {allowed ? (
          AGENT.map((a) => (
            <Card key={a.title} onPress={() => router.push(a.href)}>
              <T bold>{a.title}</T>
              <Sub>{a.sub}</Sub>
            </Card>
          ))
        ) : (
          <Notice text="경영 에이전트는 어드민이 허용한 사용자만 쓸 수 있습니다. 어드민에게 요청하세요." />
        )}
      </Section>
      <Section title="마케팅 AI">
        {allowed ? (
          <Card onPress={() => router.push('/marketing')}>
            <T bold>마케팅 지휘실</T>
            <Sub>명령 → 계획 → 승인 → 실행, 광고 규정 점검, 유사도 검토, 성과 분석</Sub>
          </Card>
        ) : (
          <Notice text="마케팅 AI도 어드민 허용자만 쓸 수 있습니다." />
        )}
      </Section>
      {user.role === 'admin' ? (
        <Section title="관리">
          <Card onPress={() => router.push('/backoffice')}>
            <T bold>백오피스</T>
            <Sub>계정 발급·관리, 업무 AI 사용 허용</Sub>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
