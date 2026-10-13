import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { isWorkUser } from '@/core/rooms';
import { Icon, type IconName } from '@/ui/icons';
import { useColors } from '@/ui/theme';
import { useMe } from '@/ui/use-app';

// 하단 탭 다섯 개: 대화 / 사건 / 찾기 / 업무 / 나 (의뢰인에게는 업무 탭을 숨깁니다)
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: '대화', tabBarIcon: icon('chat') }} />
      <Tabs.Screen name="cases" options={{ title: '사건', tabBarIcon: icon('case') }} />
      <Tabs.Screen name="find" options={{ title: '찾기', tabBarIcon: icon('map') }} />
      <Tabs.Screen name="work" options={{ title: '업무', tabBarIcon: icon('work'), href: isWorkUser(user) ? undefined : null }} />
      <Tabs.Screen name="me" options={{ title: '나', tabBarIcon: icon('me') }} />
    </Tabs>
  );
}
