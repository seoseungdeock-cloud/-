import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { presenceOf } from '@/core/messenger';
import { canJoinMembership, canSeeSuggestions } from '@/core/rooms';
import { actions } from '@/core/store';
import { usePresenceColor } from '@/ui/presence';
import { Avatar, Badge, Button, Card, Screen, Section, Sub, T } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

export const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

export default function MeScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const dot = usePresenceColor();
  const account = s.accounts.find((a) => a.userId === user.id);
  const open = s.suggestions.filter((x) => x.status === 'open').length;
  return (
    <Screen title="나">
      <Card onPress={() => router.push('/profile')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={user.nickname} uri={user.photo} dot={user.role === 'client' ? undefined : dot(user)} />
          <View style={{ flex: 1 }}>
            <T size="h2" bold>{user.nickname}</T>
            <T size="small">{[user.role === 'client' ? '' : presenceOf(user).label, user.status].filter(Boolean).join(' · ')}</T>
            <Sub>{[user.title, account?.loginId].filter(Boolean).join(' · ')}</Sub>
            <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.xs, flexWrap: 'wrap' }}>
              <Badge label={ROLE_LABEL[user.role]} tone="plain" />
              {user.membership === 'rightnow' ? <Badge label="라잇나우 멤버" tone="member" /> : null}
              {user.superAdmin && user.role === 'admin' ? <Badge label="관리자어드민" tone="accent" /> : null}
            </View>
          </View>
          <Text style={{ fontFamily: family.semibold, fontSize: 14, color: c.accent }}>편집</Text>
        </View>
      </Card>
      {canJoinMembership(user) ? (
        <Section title="라잇나우 멤버십">
          <Card onPress={() => router.push('/membership')}>
            <T bold>{user.membership === 'rightnow' ? '멤버 혜택 보기' : '멤버십 알아보기'}</T>
          </Card>
        </Section>
      ) : null}
      <Section title="라잇나우 건의사항">
        <Card onPress={() => router.push('/suggest')}>
          <T bold>건의사항 쓰기</T>
        </Card>
      </Section>
      {user.role === 'admin' ? (
        <Section title="관리">
          <Card onPress={() => router.push('/backoffice')}>
            <T bold>백오피스</T>
          </Card>
          {canSeeSuggestions(user) ? (
            <Card onPress={() => router.push('/suggest/inbox')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <T bold>건의사항함</T>
                {open ? <Badge label={`새 건의 ${open}`} /> : null}
              </View>
            </Card>
          ) : null}
        </Section>
      ) : null}
      <View style={{ marginTop: space.xl }}>
        <Button label="로그아웃" kind="ghost" onPress={() => { actions.logout(); router.replace('/login'); }} />
      </View>
    </Screen>
  );
}
