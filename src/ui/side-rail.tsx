// PC 웹: 아래 탭 대신 왼쪽 붉은 세로 메뉴 (네이버 웍스처럼 아이콘만). 위에 내 사진(나 탭), 그 아래 메뉴.
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { isHidden, unreadCount } from '@/core/messenger';
import { actions } from '@/core/store';
import { Avatar } from './kit';
import { Icon, type IconName } from './icons';
import { family, setThemeMode, THEME_MODES, useThemeMode, type ThemeMode } from './theme';
import { useApp, useMe } from './use-app';

export const RAIL_WIDTH = 64;
// 승덕이 보내 준 색 (앱 강조색보다 진한 붉은색)
const RAIL_COLOR = '#AE0E36';
const ICONS: Record<string, IconName> = { home: 'home', index: 'chat', board: 'board', cases: 'case', calendar: 'calendar', find: 'map', work: 'work', me: 'me' };

/** 종료: 설치한 PC 앱 창은 닫히고, 브라우저 탭이라 닫을 수 없으면 로그아웃합니다. */
function quit() {
  globalThis.close?.();
  setTimeout(logout, 300);
}
function logout() {
  actions.logout();
  router.replace('/login');
}

const MODE_ICON: Record<ThemeMode, IconName> = { system: 'auto', light: 'sun', dark: 'moon' };
const NEXT_MODE: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

export function SideRail({ state, descriptors, navigation }: BottomTabBarProps) {
  const mode = useThemeMode();
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
        <Pressable accessibilityRole="button" accessibilityLabel="MY" onPress={() => go(me.i)} style={{ marginBottom: 14, borderRadius: 22, borderWidth: 2, borderColor: state.index === me.i ? '#FFFFFF' : 'transparent' }}>
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
      <View style={{ marginTop: 'auto', paddingBottom: 14, gap: 6 }}>
        <RailButton icon={MODE_ICON[mode]} label={`화면 모드: ${THEME_MODES.find((m) => m.key === mode)!.label} (누르면 바뀜)`} onPress={() => setThemeMode(NEXT_MODE[mode])} />
        <RailButton icon="exit" label="로그아웃" onPress={logout} />
        <RailButton icon="power" label="종료" onPress={quit} />
      </View>
    </View>
  );
}

function RailButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(st) => ({ width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: (st as { hovered?: boolean }).hovered ? 'rgba(255,255,255,0.1)' : 'transparent' })}>
      <Icon name={icon} color="rgba(255,255,255,0.72)" size={22} />
    </Pressable>
  );
}
