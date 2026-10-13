import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { isWorkUser } from '@/core/rooms';
import { Icon, type IconName } from '@/ui/icons';
import { family, useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

// 하단 탭: 의뢰인은 홈 / 대화 / 게시판 / 사건 / 찾기 / 나, 변호사는 대화 / 게시판 / 사건 / 업무 / 나 (직원·어드민은 찾기 포함)
export default function TabLayout() {
  const c = useColors();
  const user = useMe();
  const icon = (name: IconName) => ({ focused }: { focused: boolean }) => <Icon name={name} color={focused ? c.text : c.faint} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line, ...(Platform.OS === 'web' ? { height: 64, paddingBottom: 8 } : null) },
        tabBarLabelStyle: { fontSize: 11, fontFamily: family.semibold },
      }}>
      <Tabs.Screen name="home" options={{ title: '홈', tabBarIcon: icon('home'), href: user.role === 'client' ? undefined : null }} />
      <Tabs.Screen name="index" options={{ title: '대화', tabBarIcon: icon('chat') }} />
      <Tabs.Screen name="board" options={{ title: '게시판', tabBarIcon: icon('board') }} />
      <Tabs.Screen name="cases" options={{ title: '사건', tabBarIcon: icon('case') }} />
      <Tabs.Screen name="find" options={{ title: '찾기', tabBarIcon: icon('map'), href: user.role === 'lawyer' ? null : undefined }} />
      <Tabs.Screen name="work" options={{ title: '업무', tabBarIcon: icon('work'), href: isWorkUser(user) ? undefined : null }} />
      <Tabs.Screen name="me" options={{ title: '나', tabBarIcon: icon('me') }} />
    </Tabs>
  );
}
