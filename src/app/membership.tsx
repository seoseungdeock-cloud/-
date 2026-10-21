import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MEMBERSHIP_BENEFITS } from '@/core/membership';
import { canJoinMembership } from '@/core/rooms';
import { actions } from '@/core/store';
import { GOLD, HONORS, HonorsCard, goldSheen } from '@/ui/honors';
import { Icon } from '@/ui/icons';
import { family, MAX_WIDTH, radius, space } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

export default function MembershipScreen() {
  const user = useMe();
  const isMember = user.membership === 'rightnow';
  const allowed = canJoinMembership(user);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: GOLD.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
        <Pressable accessibilityLabel="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
          <Icon name="back" color={GOLD.light} />
        </Pressable>
        <Text style={{ marginLeft: space.sm, color: GOLD.text, fontSize: 18, letterSpacing: 1, ...family.bold }}>{HONORS}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg }}>
          {!allowed ? (
            <Text style={{ color: GOLD.sub, textAlign: 'center', marginTop: space.xxl, ...family.regular }}>의뢰인 계정만 가입할 수 있습니다.</Text>
          ) : (
            <>
              <HonorsCard name={user.nickname} member={isMember} />

              <Text style={{ color: GOLD.gold, fontSize: 11, letterSpacing: 3, marginTop: space.xxl, ...family.bold }}>PRIVILEGES</Text>
              <Text style={{ color: GOLD.text, fontSize: 22, lineHeight: 32, marginTop: space.xs, ...family.bold }}>
                {isMember ? `${user.nickname} 님만을 위한 혜택` : '사건이 끝날 때까지,\n놓치는 것 없이 모십니다'}
              </Text>

              <View style={{ marginTop: space.lg, borderTopWidth: 1, borderColor: GOLD.line }}>
                {MEMBERSHIP_BENEFITS.map((b, i) => (
                  <View key={b.title} style={{ flexDirection: 'row', gap: space.lg, paddingVertical: space.lg, borderBottomWidth: 1, borderColor: GOLD.line }}>
                    <Text style={{ color: GOLD.gold, fontSize: 15, width: 24, ...family.semibold }}>{String(i + 1).padStart(2, '0')}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: GOLD.text, fontSize: 16, ...family.bold }}>{b.title}</Text>
                      <Text style={{ color: GOLD.sub, fontSize: 14, lineHeight: 21, marginTop: 4, ...family.regular }}>{b.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={{ marginTop: space.xl }}>
                {isMember ? (
                  <Pressable accessibilityRole="button" onPress={() => actions.setMembership('basic')} style={({ pressed }) => ({ height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                    <Text style={{ color: GOLD.sub, fontSize: 14, textDecorationLine: 'underline', ...family.regular }}>멤버십 해지</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => actions.setMembership('rightnow')}
                    style={({ pressed }) => ({ height: 56, borderRadius: radius.md, backgroundColor: GOLD.gold, ...goldSheen(GOLD.light, GOLD.deep), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                    <Text style={{ color: GOLD.bg, fontSize: 17, letterSpacing: 1, ...family.bold }}>{HONORS} 시작하기</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
