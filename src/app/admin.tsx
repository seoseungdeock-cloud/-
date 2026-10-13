import { useState } from 'react';
import { Switch } from 'react-native';

import { actions } from '@/core/store';
import { Empty, Notice, Row, Screen, Sub } from '@/ui/kit';
import { useApp, useMe } from '@/ui/use-app';

export default function AdminScreen() {
  const s = useApp();
  const user = useMe();
  const [error, setError] = useState<string>();
  if (user.role !== 'admin') return <Screen title="사용자 권한" back><Empty text="어드민만 볼 수 있습니다." /></Screen>;
  const staff = s.users.filter((u) => u.role === 'staff' || u.role === 'lawyer');
  return (
    <Screen title="사용자 권한" back>
      <Sub>경영 에이전트와 마케팅 AI를 쓸 수 있는 사람을 정합니다. 의뢰인에게는 허용할 수 없습니다.</Sub>
      {error ? <Notice text={error} /> : null}
      {staff.map((u) => (
        <Row
          key={u.id}
          title={u.nickname}
          sub={u.role === 'lawyer' ? '변호사' : '직원'}
          right={
            <Switch
              value={u.agentAccess}
              onValueChange={(v) => {
                const res = actions.setAgentAccess(u.id, v);
                setError(res.ok ? undefined : res.reason);
              }}
            />
          }
        />
      ))}
    </Screen>
  );
}
