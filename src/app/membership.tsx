import { View } from 'react-native';

import { MEMBERSHIP_BENEFITS } from '@/core/membership';
import { canJoinMembership } from '@/core/rooms';
import { actions } from '@/core/store';
import { Badge, Button, Card, Empty, Screen, Sub, T } from '@/ui/kit';
import { space, useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

export default function MembershipScreen() {
  const user = useMe();
  const c = useColors();
  const isMember = user.membership === 'rightnow';
  if (!canJoinMembership(user)) return <Screen title="라잇나우 멤버십" back><Empty text="의뢰인 계정만 가입할 수 있습니다." /></Screen>;
  return (
    <Screen title="라잇나우 멤버십" back>
      <Card style={{ backgroundColor: isMember ? c.text : c.surface, paddingVertical: space.xl }}>
        <Badge label={isMember ? '멤버' : '일반'} tone="member" />
        <T size="title" bold color={isMember ? c.bg : c.text} style={{ marginTop: space.sm }}>
          {isMember ? `${user.nickname}님, 반갑습니다` : '내 사건을 더 편하게'}
        </T>
        <T color={isMember ? c.faint : c.sub}>사건이 끝날 때까지 놓치는 것 없이 챙겨 드립니다.</T>
      </Card>
      {MEMBERSHIP_BENEFITS.map((b) => (
        <Card key={b.title}>
          <T bold>{b.title}</T>
          <Sub>{b.detail}</Sub>
        </Card>
      ))}
      <View style={{ marginTop: space.md }}>
        {isMember ? (
          <Button label="멤버십 해지" kind="ghost" onPress={() => actions.setMembership('basic')} />
        ) : (
          <Button label="멤버십 시작하기" onPress={() => actions.setMembership('rightnow')} />
        )}
      </View>
    </Screen>
  );
}
