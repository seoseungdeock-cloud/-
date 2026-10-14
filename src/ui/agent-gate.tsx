import type { ReactNode } from 'react';

import { canSeeWorkTab } from '@/core/rooms';
import { Empty, Screen } from './kit';
import { useMe } from './use-app';

/** 경영 에이전트·마케팅 지휘실 화면(업무 탭)은 어드민 계정만 엽니다. 대화방 @AI 명령은 백오피스 허용으로 따로 정합니다. */
export function AgentGate({ title, children }: { title: string; children: ReactNode }) {
  const user = useMe();
  if (!canSeeWorkTab(user)) {
    return (
      <Screen title={title} back>
        <Empty text="어드민 계정만 쓸 수 있습니다." />
      </Screen>
    );
  }
  return <>{children}</>;
}
