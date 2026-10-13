import { router } from 'expo-router';
import { View } from 'react-native';

import { actions } from '@/core/store';
import { Avatar, Badge, Button, Card, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

export default function MeScreen() {
  const s = useApp();
  const user = useMe();
  const account = s.accounts.find((a) => a.userId === user.id);
  return (
    <Screen title="나">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={user.nickname} />
          <View style={{ flex: 1 }}>
            <T size="h2" bold>{user.nickname}</T>
            <Sub>{account?.loginId}</Sub>
            <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.xs, flexWrap: 'wrap' }}>
              <Badge label={ROLE_LABEL[user.role]} tone="plain" />
              {user.membership === 'rightnow' ? <Badge label="라잇나우 멤버" tone="member" /> : null}
            </View>
          </View>
        </View>
      </Card>
      <Section title="라잇나우 멤버십">
        <Card onPress={() => router.push('/membership')}>
          <T bold>{user.membership === 'rightnow' ? '멤버 혜택 보기' : '멤버십 알아보기'}</T>
        </Card>
      </Section>
      {user.role === 'admin' ? (
        <Section title="관리">
          <Card onPress={() => router.push('/backoffice')}>
            <T bold>백오피스</T>
          </Card>
        </Section>
      ) : null}
      <View style={{ marginTop: space.xl }}>
        <Button label="로그아웃" kind="ghost" onPress={() => { actions.logout(); router.replace('/login'); }} />
      </View>
    </Screen>
  );
}
