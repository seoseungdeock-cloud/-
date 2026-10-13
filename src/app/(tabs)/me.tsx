import { router } from 'expo-router';
import { View } from 'react-native';

import { actions, resetState } from '@/core/store';
import { Avatar, Badge, Button, Card, Chip, Chips, Screen, Section, Sub, T } from '@/ui/kit';
import { space } from '@/ui/theme';
import { useApp, useMe } from '@/ui/use-app';

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;

export default function MeScreen() {
  const s = useApp();
  const user = useMe();
  return (
    <Screen title="나">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={user.nickname} />
          <View style={{ flex: 1 }}>
            <T size="h2" bold>{user.nickname}</T>
            <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.xs, flexWrap: 'wrap' }}>
              <Badge label={ROLE_LABEL[user.role]} tone="plain" />
              {user.membership === 'rightnow' ? <Badge label="라잇나우 멤버" tone="member" /> : null}
            </View>
          </View>
        </View>
      </Card>
      <Section title="인증">
        <Sub>평소에는 닉네임으로만 보입니다. 사건방에 들어갈 때만 본인확인이 필요하고, 실명 정보는 담당 로펌에만 전달됩니다.</Sub>
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Card>
            <T bold>본인확인 {user.identityVerified ? '완료' : '미완료'}</T>
            <Sub>사건방 입장에 필요 (지금은 인증 서비스 연결 전이라 버튼으로 처리)</Sub>
            {!user.identityVerified ? <View style={{ marginTop: space.sm }}><Button label="본인확인 하기" kind="soft" small onPress={() => actions.verify('identity')} /></View> : null}
          </Card>
          <Card>
            <T bold>성인인증 {user.adultVerified ? '완료' : '미완료'}</T>
            <Sub>모르는 사람과의 대화에 필요</Sub>
            {!user.adultVerified ? <View style={{ marginTop: space.sm }}><Button label="성인인증 하기" kind="soft" small onPress={() => actions.verify('adult')} /></View> : null}
          </Card>
        </View>
      </Section>
      <Section title="라잇나우 멤버십">
        <Card onPress={() => router.push('/membership')}>
          <T bold>{user.membership === 'rightnow' ? '멤버 혜택 보기' : '멤버십 알아보기'}</T>
          <Sub>사건 진행 리포트, 기일 알림, 서류 보관함 등</Sub>
        </Card>
      </Section>
      <Section title="다른 사용자로 보기 (개발용)">
        <Sub>뼈대 확인용입니다. 역할별 화면을 바꿔 볼 수 있습니다.</Sub>
        <View style={{ height: space.sm }} />
        <Chips>
          {s.users.map((u) => (
            <Chip key={u.id} label={`${u.nickname} (${ROLE_LABEL[u.role]})`} active={u.id === user.id} onPress={() => actions.switchUser(u.id)} />
          ))}
        </Chips>
        <Button label="데모 데이터 처음으로" kind="ghost" small onPress={resetState} />
      </Section>
    </Screen>
  );
}
