// PC 웹·PC 앱 틀 (슬랙식): 왼쪽에 진한 남색 메뉴, 오른쪽에 흰 본문.
//   데스크톱(1024px~): 240px 메뉴 — 로고, 글자 있는 메뉴(현재 항목은 밝은 칸이 미끄러져 따라감), 아래에 내 정보·PC 앱 설치·화면 모드·로그아웃
//   태블릿(768~1023): 64px 아이콘 메뉴
//   모바일: 이 틀 없이 아래 탭 (폰 앱과 같음)
// 로그인 뒤 모든 화면(대화방·게시글·설정까지)에서 메뉴가 그대로 보입니다.
import { router, usePathname } from 'expo-router';
import { type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { promptInstall, useInstallState } from '@/core/install';
import { isHidden, unreadCount } from '@/core/messenger';
import { canSeeWorkTab } from '@/core/rooms';
import { actions } from '@/core/store';
import type { User } from '@/core/types';
import { Wordmark } from './brand';
import { Icon, type IconName } from './icons';
import { Avatar } from './kit';
import { Bounce, Press, useSlideY } from './motion';
import { family, radius, setThemeMode, THEME_MODES, useColors, useThemeMode, type ThemeMode } from './theme';
import { useApp, useMe } from './use-app';
import { useLayout } from './web-frame';

type Href = '/' | '/board' | '/calendar' | '/tasks' | '/work' | '/me';
type NavItem = { href: Href; label: string; icon: IconName; /** 이 경로들로 시작하면 이 메뉴가 켜진 것으로 */ also?: string[] };

export function navItems(user: User): NavItem[] {
  const items: NavItem[] = [];
  items.push({ href: '/', label: '대화', icon: 'chat', also: ['/room', '/contact', '/open'] });
  items.push({ href: '/board', label: '게시판', icon: 'board' });
  items.push({ href: '/calendar', label: '캘린더', icon: 'calendar' });
  if (user.role !== 'client') items.push({ href: '/tasks', label: '할 일', icon: 'check' });
  if (canSeeWorkTab(user)) items.push({ href: '/work', label: '업무', icon: 'work', also: ['/axiom', '/backoffice', '/auth-codes', '/marketing'] });
  return items;
}

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;
const MODE_ICON: Record<ThemeMode, IconName> = { system: 'auto', light: 'sun', dark: 'moon' };
const NEXT_MODE: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

export function isOn(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/' || pathname === '/index' || (item.also ?? []).some((p) => pathname.startsWith(p));
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.also ?? []).some((p) => pathname.startsWith(p));
}

function logout() {
  actions.logout();
  router.replace('/login');
}

export function Shell({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const { mode, navWidth } = useLayout();
  const c = useColors();
  if (Platform.OS !== 'web' || !signedIn || mode === 'phone') return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.navBg }}>
      <View style={{ width: navWidth }}>{mode === 'desktop' ? <Sidebar /> : <Rail />}</View>
      <View style={{ flex: 1, minWidth: 0, backgroundColor: c.bg, borderTopLeftRadius: radius.xl - 2, borderBottomLeftRadius: 0, overflow: 'hidden', marginTop: 8 }}>{children}</View>
    </View>
  );
}

/** 안 읽은 메시지 수 (대화 메뉴 배지) */
export function useUnread(): number {
  const s = useApp();
  const user = useMe();
  return s.rooms.filter((r) => r.memberIds.includes(user.id) && !isHidden(r, user.id, s.messages)).reduce((n, r) => n + unreadCount(r, user.id, s.messages, s.reads), 0);
}

const ITEM_H = 40;
const ITEM_GAP = 2;

function Sidebar() {
  const c = useColors();
  const user = useMe();
  const pathname = usePathname();
  const unread = useUnread();
  const mode = useThemeMode();
  const install = useInstallState();
  const onMe = pathname === '/me' || pathname.startsWith('/profile') || pathname.startsWith('/suggest');
  const items = navItems(user);
  const activeIndex = items.findIndex((it) => isOn(pathname, it));
  const slide = useSlideY(Math.max(0, activeIndex) * (ITEM_H + ITEM_GAP));
  return (
    <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 20, paddingBottom: 14, backgroundColor: c.navBg }}>
      <Pressable accessibilityRole="link" accessibilityLabel="스카이넷 첫 화면" onPress={() => router.navigate('/')} style={{ paddingHorizontal: 10, marginBottom: 22, height: 26, justifyContent: 'center' }}>
        <Wordmark height={22} onDark />
      </Pressable>
      <View style={{ gap: ITEM_GAP, position: 'relative' }}>
        {activeIndex >= 0 ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: ITEM_H, borderRadius: radius.md - 2, backgroundColor: c.navActive }, slide]} /> : null}
        {items.map((it) => {
          const on = isOn(pathname, it);
          return (
            <Press
              key={it.href}
              accessibilityRole="link"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: on }}
              onPress={() => router.navigate(it.href)}
              scale={0.98}
              style={({ hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                height: ITEM_H,
                paddingHorizontal: 10,
                borderRadius: radius.md - 2,
                backgroundColor: hovered && !on ? c.navHover : 'transparent',
              })}>
              <Icon name={it.icon} color={on ? c.navText : c.navMute} size={19} />
              <Text style={{ ...family.semibold, fontSize: 14, color: on ? c.navText : c.navMute, letterSpacing: -0.2 }}>{it.label}</Text>
              {it.href === '/' && unread ? (
                <View style={{ marginLeft: 'auto' }}>
                  <Bounce keyOf={unread}>
                    <Badge n={unread} />
                  </Bounce>
                </View>
              ) : null}
            </Press>
          );
        })}
      </View>
      <View style={{ marginTop: 'auto', gap: 6 }}>
        {install === 'available' ? (
          <Press
            accessibilityRole="button"
            accessibilityLabel="PC 앱으로 설치"
            onPress={() => void promptInstall()}
            scale={0.98}
            style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: radius.md, backgroundColor: hovered ? c.navActive : c.navHover })}>
            <Icon name="down" color={c.navAccent} size={16} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...family.semibold, fontSize: 13, color: c.navText }}>PC 앱으로 설치</Text>
              <Text style={{ ...family.regular, fontSize: 11, color: c.navMute }}>바탕화면·작업표시줄에서 바로 열기</Text>
            </View>
          </Press>
        ) : null}
        <Press
          accessibilityRole="link"
          accessibilityLabel="MY"
          onPress={() => router.navigate('/me')}
          scale={0.98}
          style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8, borderRadius: radius.md, backgroundColor: onMe ? c.navActive : hovered ? c.navHover : 'transparent' })}>
          <Avatar name={user.nickname} uri={user.photo} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ ...family.semibold, fontSize: 13.5, color: c.navText }}>{user.nickname}</Text>
            <Text numberOfLines={1} style={{ ...family.regular, fontSize: 11.5, color: c.navMute }}>{[user.title, user.dept].filter(Boolean).join(' · ') || ROLE_LABEL[user.role]}</Text>
          </View>
        </Press>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 }}>
          <Tool icon={MODE_ICON[mode]} label={`화면 모드: ${THEME_MODES.find((m) => m.key === mode)!.label} (누르면 바뀜)`} onPress={() => setThemeMode(NEXT_MODE[mode])} />
          <Tool icon="exit" label="로그아웃" onPress={logout} />
          <Text style={{ marginLeft: 'auto', ...family.regular, fontSize: 11, color: c.navMute }}>v1.0</Text>
        </View>
      </View>
    </View>
  );
}

const RAIL_H = 44;
const RAIL_GAP = 6;

function Rail() {
  const c = useColors();
  const user = useMe();
  const pathname = usePathname();
  const unread = useUnread();
  const mode = useThemeMode();
  const onMe = pathname === '/me' || pathname.startsWith('/profile');
  const items = navItems(user);
  const activeIndex = items.findIndex((it) => isOn(pathname, it));
  const slide = useSlideY(Math.max(0, activeIndex) * (RAIL_H + RAIL_GAP));
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingTop: 16, paddingBottom: 12, backgroundColor: c.navBg }}>
      <View style={{ marginBottom: 14 }}>
        <Wordmark compact onDark />
      </View>
      <View style={{ gap: RAIL_GAP, position: 'relative' }}>
        {activeIndex >= 0 ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: RAIL_H, height: RAIL_H, borderRadius: radius.md, backgroundColor: c.navActive }, slide]} /> : null}
        {items.map((it) => {
          const on = isOn(pathname, it);
          return (
            <Press
              key={it.href}
              accessibilityRole="link"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: on }}
              onPress={() => router.navigate(it.href)}
              scale={0.92}
              style={({ hovered }) => ({ width: RAIL_H, height: RAIL_H, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered && !on ? c.navHover : 'transparent' })}>
              <Icon name={it.icon} color={on ? c.navText : c.navMute} size={22} />
              {it.href === '/' && unread ? (
                <View style={{ position: 'absolute', top: 2, right: 0 }}>
                  <Bounce keyOf={unread}>
                    <Badge n={unread} />
                  </Bounce>
                </View>
              ) : null}
            </Press>
          );
        })}
      </View>
      <View style={{ marginTop: 'auto', alignItems: 'center', gap: 4 }}>
        <Press accessibilityRole="link" accessibilityLabel="MY" onPress={() => router.navigate('/me')} scale={0.92} style={{ borderRadius: 20, borderWidth: 2, borderColor: onMe ? c.navText : 'transparent', marginBottom: 6 }}>
          <Avatar name={user.nickname} uri={user.photo} size={32} />
        </Press>
        <Tool icon={MODE_ICON[mode]} label={`화면 모드: ${THEME_MODES.find((m) => m.key === mode)!.label} (누르면 바뀜)`} onPress={() => setThemeMode(NEXT_MODE[mode])} />
        <Tool icon="exit" label="로그아웃" onPress={logout} />
      </View>
    </View>
  );
}

export function Badge({ n, color }: { n: number; color?: string }) {
  const c = useColors();
  return (
    <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: color ?? c.navAccent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 11, ...family.bold }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

function Tool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scale={0.9}
      style={({ hovered }) => ({ width: 36, height: 36, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? c.navHover : 'transparent' })}>
      <Icon name={icon} color={c.navMute} size={19} />
    </Press>
  );
}
