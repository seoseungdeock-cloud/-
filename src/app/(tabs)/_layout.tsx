import { Tabs } from 'expo-router';

import { canSeeWorkTab } from '@/core/rooms';
import { useCallerNamesAutoSync } from '@/ui/caller-sync';
import type { IconName } from '@/ui/icons';
import { useUnread } from '@/ui/shell';
import { TabBar } from '@/ui/tab-bar';
import { useMe } from '@/ui/use-app';
import { useLayout } from '@/ui/web-frame';

// 모바일(폰 앱·좁은 창)은 하단 탭(ui/tab-bar.tsx, 미끄러지는 표시). PC 구성은 왼쪽 메뉴(ui/shell.tsx)가 붙으므로 탭 막대를 숨깁니다.
// 하단 탭: 대화 / 게시판 / 캘린더 / MY. 어드민·권한 있는 직원은 업무 포함. (사건은 사건방 안에서 봅니다)
const ICONS: Record<string, IconName> = { index: 'chat', board: 'board', calendar: 'calendar', work: 'work', me: 'me' };

export default function TabLayout() {
  const user = useMe();
  const { desktop } = useLayout();
  const unread = useUnread();
  useCallerNamesAutoSync();
  return (
    <Tabs
      tabBar={desktop ? () => null : (props) => <TabBar {...props} icons={ICONS} badges={{ index: unread }} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: '대화' }} />
      <Tabs.Screen name="board" options={{ title: '게시판' }} />
      <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
      <Tabs.Screen name="work" options={{ title: '업무', href: canSeeWorkTab(user) ? undefined : null }} />
      <Tabs.Screen name="me" options={{ title: 'MY' }} />
    </Tabs>
  );
}
