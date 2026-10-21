// PC 웹: 아래 탭 대신 왼쪽 붉은 세로 메뉴 (네이버 웍스처럼 아이콘만). 위에 내 사진(나 탭), 그 아래 메뉴.
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, Text, View } from 'react-native';

import { isHidden, unreadCount } from '@/core/messenger';
import { Avatar } from './kit';
import { Icon, type IconName } from './icons';
import { family } from './theme';
import { useApp, useMe } from './use-app';

export const RAIL_WIDTH = 64;
// 승덕이 보내 준 색 (앱 강조색보다 진한 붉은색)
const RAIL_COLOR = '#AE0E36';
const ICONS: Record<string, IconName> = { home: 'home', index: 'chat', board: 'board', cases: 'case', find: 'map', work: 'work', me: 'me' };

export function SideRail({ state, descriptors, navigation }: BottomTabBarProps) {
  const s = useApp();
  const user = useMe();
  const unread = s.rooms.filter((r) => r.memberIds.includes(user.id) && !isHidden(r, user.id, s.messages)).reduce((n, r) => n + unreadCount(r, user.id, s.messages, s.reads), 0);
  const go = (index: number) => {
    const route = state.routes[index];
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };
  const shown = state.routes.map((r, i) => ({ r, i })).filter(({ r }) => (descriptors[r.key].options.tabBarItemStyle as { display?: string } | undefined)?.display !== 'none');
  const me = shown.find(({ r }) => r.name === 'me');
  const items = shown.filter(({ r }) => r.name !== 'me');
  return (
    <View style={{ width: RAIL_WIDTH, backgroundColor: RAIL_COLOR, alignItems: 'center', paddingTop: 14, gap: 6 }}>
      {me ? (
        <Pressable accessibilityRole="button" accessibilityLabel="나" onPress={() => go(me.i)} style={{ marginBottom: 14, borderRadius: 22, borderWidth: 2, borderColor: state.index === me.i ? '#FFFFFF' : 'transparent' }}>
          <Avatar name={user.nickname} uri={user.photo} size={38} tone="rgba(255,255,255,0.85)" />
        </Pressable>
      ) : null}
      {items.map(({ r, i }) => {
        const on = state.index === i;
        const label = descriptors[r.key].options.title ?? r.name;
        return (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            onPress={() => go(i)}
            style={(st) => ({ width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(255,255,255,0.22)' : (st as { hovered?: boolean }).hovered ? 'rgba(255,255,255,0.1)' : 'transparent' })}>
            <Icon name={ICONS[r.name] ?? 'menu'} color={on ? '#FFFFFF' : 'rgba(255,255,255,0.72)'} size={24} />
            {r.name === 'index' && unread ? (
              <View style={{ position: 'absolute', top: 3, right: 0, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: RAIL_COLOR, fontSize: 10, ...family.bold }}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
