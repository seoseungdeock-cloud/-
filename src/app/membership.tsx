import { View } from 'react-native';

import { MEMBERSHIP_BENEFITS } from '@/core/membership';
import { actions } from '@/core/store';
import { Badge, Button, Card, Screen, Sub, T } from '@/ui/kit';
import { space, useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

export default function MembershipScreen() {
  const user = useMe();
  const c = useColors();
  const isMember = user.membership === 'rightnow';
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
      <View style={{ marginTop: space.sm }}>
        <Sub>결제는 아직 연결되지 않았습니다. 멤버십 혜택은 라잇나우 자체 서비스이며, 특정 변호사 할인·배정과는 무관합니다.</Sub>
      </View>
    </Screen>
  );
}
