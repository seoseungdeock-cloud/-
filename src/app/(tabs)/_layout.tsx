import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { canSeeWorkTab } from '@/core/rooms';
import { useCallerNamesAutoSync } from '@/ui/caller-sync';
import { Icon, type IconName } from '@/ui/icons';
import { family, useColors } from '@/ui/theme';
import { SideRail } from '@/ui/side-rail';
import { useMe } from '@/ui/use-app';

// PC 웹은 왼쪽 붉은 세로 메뉴(아이콘만), 폰 앱은 하단 탭.
// 하단 탭: 의뢰인은 홈 / 대화 / 게시판 / 사건 / 캘린더 / 찾기 / MY, 변호사는 대화 / 게시판 / 사건 / 캘린더 / MY, 직원은 찾기 포함, 어드민은 찾기·업무 포함
export default function TabLayout() {
  const c = useColors();
  const user = useMe();
  useCallerNamesAutoSync();
  const icon = (name: IconName) => ({ focused }: { focused: boolean }) => <Icon name={name} color={focused ? c.text : c.faint} />;
  return (
    <Tabs
      tabBar={Platform.OS === 'web' ? (props) => <SideRail {...props} /> : undefined}
      screenOptions={{
        tabBarPosition: Platform.OS === 'web' ? 'left' : 'bottom',
        headerShown: false,
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line, ...(Platform.OS === 'web' ? { height: 64, paddingBottom: 8 } : null) },
        tabBarLabelStyle: { fontSize: 11, ...family.semibold },
      }}>
      <Tabs.Screen name="home" options={{ title: '홈', tabBarIcon: icon('home'), href: user.role === 'client' ? undefined : null }} />
      <Tabs.Screen name="index" options={{ title: '대화', tabBarIcon: icon('chat') }} />
      <Tabs.Screen name="board" options={{ title: '게시판', tabBarIcon: icon('board') }} />
      <Tabs.Screen name="cases" options={{ title: '사건', tabBarIcon: icon('case') }} />
      <Tabs.Screen name="calendar" options={{ title: '캘린더', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="find" options={{ title: '찾기', tabBarIcon: icon('map'), href: user.role === 'lawyer' ? null : undefined }} />
      <Tabs.Screen name="work" options={{ title: '업무', tabBarIcon: icon('work'), href: canSeeWorkTab(user) ? undefined : null }} />
      <Tabs.Screen name="me" options={{ title: 'MY', tabBarIcon: icon('me') }} />
    </Tabs>
  );
}
