import type { ReactNode } from 'react';

import { canUseAgents } from '@/core/rooms';
import { Empty, Screen } from './kit';
import { useMe } from './use-app';

/** 경영 에이전트·마케팅 AI 화면은 어드민이 허용한 사용자만 엽니다. */
export function AgentGate({ title, children }: { title: string; children: ReactNode }) {
  const user = useMe();
  if (!canUseAgents(user)) {
    return (
      <Screen title={title} back>
        <Empty text="어드민이 허용한 사용자만 쓸 수 있습니다." />
      </Screen>
    );
  }
  return <>{children}</>;
}
