import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { presenceOf } from '@/core/messenger';
import { canJoinMembership, canSeeSuggestions } from '@/core/rooms';
import { actions } from '@/core/store';
import { enableWebPush, webPushState } from '@/core/web-push';
import { HonorsCard } from '@/ui/honors';
import { Icon } from '@/ui/icons';
import { usePresenceColor } from '@/ui/presence';
import { Avatar, Badge, Button, Card, Chip, Chips, Screen, Section, Sub, T } from '@/ui/kit';
import { family, space, useColors } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';
import { FRAME_SIZES, setFrameSize, useFrameSize } from '@/ui/web-frame';

export const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

export default function MeScreen() {
  const s = useApp();
  const user = useMe();
  const c = useColors();
  const dot = usePresenceColor();
  const account = s.accounts.find((a) => a.userId === user.id);
  const open = s.suggestions.filter((x) => x.status === 'open').length;
  return (
    <Screen title="MY">
      <Card onPress={() => router.push('/profile')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={user.nickname} uri={user.photo} dot={user.role === 'client' ? undefined : dot(user)} />
          <View style={{ flex: 1 }}>
            <T size="h2" bold>{user.nickname}</T>
            <T size="small">{[user.role === 'client' ? '' : presenceOf(user).label, user.status].filter(Boolean).join(' · ')}</T>
            <Sub>{[user.title, account?.loginId].filter(Boolean).join(' · ')}</Sub>
            <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.xs, flexWrap: 'wrap' }}>
              <Badge label={ROLE_LABEL[user.role]} tone="plain" />
              {user.membership === 'rightnow' ? <Badge label="대륜 아너스" tone="member" /> : null}
              {user.superAdmin && user.role === 'admin' ? <Badge label="관리자어드민" tone="accent" /> : null}
            </View>
          </View>
          <Text style={{ ...family.semibold, fontSize: 14, color: c.accent }}>편집</Text>
        </View>
      </Card>
      <Card onPress={() => router.push({ pathname: '/room/[id]', params: { id: actions.openSelfChat() } })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Icon name="chat" color={c.accent} size={22} />
          <View style={{ flex: 1 }}>
            <T bold>나와의 메시지</T>
            <Sub>메모·파일을 나에게 보내 두는 대화방</Sub>
          </View>
          <Icon name="chevron" color={c.faint} size={18} />
        </View>
      </Card>
      {canJoinMembership(user) ? (
        <Section title="멤버십">
          <Pressable accessibilityRole="button" onPress={() => router.push('/membership')} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <HonorsCard name={user.nickname} member={user.membership === 'rightnow'} compact />
          </Pressable>
        </Section>
      ) : null}
      <WebPushCard />
      <FrameSizeCard />
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

/** PC·웹 브라우저에서만: 이 브라우저로 새 메시지·기일 알림 받기 */
function WebPushCard() {
  const [state, setState] = useState(webPushState());
  if (state === 'unsupported') return null;
  return (
    <Section title="이 PC 알림">
      <Card onPress={state === 'default' ? () => void enableWebPush().then(setState) : undefined}>
        <T bold>{state === 'granted' ? '알림 받는 중' : state === 'denied' ? '알림이 차단됨' : '알림 받기'}</T>
        {state === 'denied' ? <Sub>브라우저 주소창 왼쪽 자물쇠 아이콘에서 알림을 허용해 주세요.</Sub> : null}
      </Card>
    </Section>
  );
}

/** PC·웹 브라우저에서만: 화면 크기 (처음에는 폰 크기) */
function FrameSizeCard() {
  const size = useFrameSize();
  if (Platform.OS !== 'web') return null;
  return (
    <Section title="화면 크기">
      <Chips>
        {FRAME_SIZES.map((f) => <Chip key={f.key} label={f.label} active={size === f.key} onPress={() => setFrameSize(f.key)} />)}
      </Chips>
    </Section>
  );
}
