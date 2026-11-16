// PC 웹·PC 앱 틀: 왼쪽 메뉴 + 본문 (SKYZAI 송무 화면 구성 참고).
//   데스크톱(1024px~): 240px 메뉴 — 로고, 글자 있는 메뉴, 아래에 내 정보·PC 앱 설치·화면 모드·로그아웃
//   태블릿(768~1023): 64px 아이콘 메뉴
//   모바일: 이 틀 없이 아래 탭 (폰 앱과 같음)
// 로그인 뒤 모든 화면(대화방·게시글·설정까지)에서 메뉴가 그대로 보입니다.
import { router, usePathname } from 'expo-router';
import { type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { promptInstall, useInstallState } from '@/core/install';
import { isHidden, unreadCount } from '@/core/messenger';
import { canSeeWorkTab } from '@/core/rooms';
import { actions } from '@/core/store';
import type { User } from '@/core/types';
import { Wordmark } from './brand';
import { Icon, type IconName } from './icons';
import { Avatar } from './kit';
import { family, radius, setThemeMode, THEME_MODES, useColors, useThemeMode, type ThemeMode } from './theme';
import { useApp, useMe } from './use-app';
import { useLayout } from './web-frame';

type Href = '/home' | '/' | '/board' | '/cases' | '/calendar' | '/find' | '/work' | '/me';
type NavItem = { href: Href; label: string; icon: IconName; /** 이 경로들로 시작하면 이 메뉴가 켜진 것으로 */ also?: string[] };

export function navItems(user: User): NavItem[] {
  const items: NavItem[] = [];
  if (user.role === 'client') items.push({ href: '/home', label: '홈', icon: 'home', also: ['/recommend', '/membership', '/service', '/lawyer'] });
  items.push({ href: '/', label: '대화', icon: 'chat', also: ['/room', '/contact', '/open'] });
  items.push({ href: '/board', label: '게시판', icon: 'board' });
  items.push({ href: '/cases', label: '사건', icon: 'case' });
  items.push({ href: '/calendar', label: '캘린더', icon: 'calendar' });
  if (user.role !== 'lawyer') items.push({ href: '/find', label: '찾기', icon: 'map', also: ['/lawyer'] });
  if (canSeeWorkTab(user)) items.push({ href: '/work', label: '업무', icon: 'work', also: ['/axiom', '/backoffice', '/auth-codes', '/marketing'] });
  return items;
}

const ROLE_LABEL = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' } as const;
const MODE_ICON: Record<ThemeMode, IconName> = { system: 'auto', light: 'sun', dark: 'moon' };
const NEXT_MODE: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

function isOn(pathname: string, item: NavItem): boolean {
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
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
      <View style={{ width: navWidth, borderRightWidth: 1, borderRightColor: c.lineStrong, backgroundColor: c.bg }}>{mode === 'desktop' ? <Sidebar /> : <Rail />}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/** 안 읽은 메시지 수 (대화 메뉴 배지) */
function useUnread(): number {
  const s = useApp();
  const user = useMe();
  return s.rooms.filter((r) => r.memberIds.includes(user.id) && !isHidden(r, user.id, s.messages)).reduce((n, r) => n + unreadCount(r, user.id, s.messages, s.reads), 0);
}

function Sidebar() {
  const c = useColors();
  const user = useMe();
  const pathname = usePathname();
  const unread = useUnread();
  const mode = useThemeMode();
  const install = useInstallState();
  const onMe = pathname === '/me' || pathname.startsWith('/profile') || pathname.startsWith('/suggest');
  return (
    <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 18, paddingBottom: 14 }}>
      <Pressable accessibilityRole="link" accessibilityLabel="스카이넷 첫 화면" onPress={() => router.navigate('/')} style={{ paddingHorizontal: 8, marginBottom: 18 }}>
        <Wordmark />
      </Pressable>
      <View style={{ gap: 2 }}>
        {navItems(user).map((it) => {
          const on = isOn(pathname, it);
          return (
            <Pressable
              key={it.href}
              accessibilityRole="link"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: on }}
              onPress={() => router.navigate(it.href)}
              style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingHorizontal: 10, borderRadius: radius.sm + 2, backgroundColor: on ? c.accentSoft : (st as { hovered?: boolean }).hovered ? c.surface : 'transparent' })}>
              <Icon name={it.icon} color={on ? c.accent : c.sub} size={20} />
              <Text style={{ ...(on ? family.bold : family.semibold), fontSize: 14, color: on ? c.accent : c.text }}>{it.label}</Text>
              {it.href === '/' && unread ? <Badge n={unread} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 'auto', gap: 6 }}>
        {install === 'available' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="PC 앱으로 설치"
            onPress={() => void promptInstall()}
            style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: (st as { hovered?: boolean }).hovered ? c.surface : c.bg })}>
            <Icon name="down" color={c.accent} size={16} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...family.semibold, fontSize: 13, color: c.text }}>PC 앱으로 설치</Text>
              <Text style={{ ...family.regular, fontSize: 11, color: c.faint }}>바탕화면·작업표시줄에서 바로 열기</Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="MY"
          onPress={() => router.navigate('/me')}
          style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8, borderRadius: radius.sm + 2, backgroundColor: onMe ? c.accentSoft : (st as { hovered?: boolean }).hovered ? c.surface : 'transparent' })}>
          <Avatar name={user.nickname} uri={user.photo} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ ...family.bold, fontSize: 13.5, color: c.text }}>{user.nickname}</Text>
            <Text numberOfLines={1} style={{ ...family.regular, fontSize: 11.5, color: c.faint }}>{[user.title, user.dept].filter(Boolean).join(' · ') || ROLE_LABEL[user.role]}</Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 }}>
          <Tool icon={MODE_ICON[mode]} label={`화면 모드: ${THEME_MODES.find((m) => m.key === mode)!.label} (누르면 바뀜)`} onPress={() => setThemeMode(NEXT_MODE[mode])} />
          <Tool icon="exit" label="로그아웃" onPress={logout} />
          <Text style={{ marginLeft: 'auto', ...family.regular, fontSize: 11, color: c.faint }}>v1.0</Text>
        </View>
      </View>
    </View>
  );
}

function Rail() {
  const c = useColors();
  const user = useMe();
  const pathname = usePathname();
  const unread = useUnread();
  const mode = useThemeMode();
  const onMe = pathname === '/me' || pathname.startsWith('/profile');
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingTop: 14, paddingBottom: 12, gap: 4 }}>
      <View style={{ marginBottom: 12 }}>
        <Wordmark compact />
      </View>
      {navItems(user).map((it) => {
        const on = isOn(pathname, it);
        return (
          <Pressable
            key={it.href}
            accessibilityRole="link"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: on }}
            onPress={() => router.navigate(it.href)}
            style={(st) => ({ width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accentSoft : (st as { hovered?: boolean }).hovered ? c.surface : 'transparent' })}>
            <Icon name={it.icon} color={on ? c.accent : c.sub} size={22} />
            {it.href === '/' && unread ? (
              <View style={{ position: 'absolute', top: 4, right: 2 }}>
                <Badge n={unread} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <View style={{ marginTop: 'auto', alignItems: 'center', gap: 4 }}>
        <Pressable accessibilityRole="link" accessibilityLabel="MY" onPress={() => router.navigate('/me')} style={{ borderRadius: 20, borderWidth: 2, borderColor: onMe ? c.accent : 'transparent', marginBottom: 6 }}>
          <Avatar name={user.nickname} uri={user.photo} size={32} />
        </Pressable>
        <Tool icon={MODE_ICON[mode]} label={`화면 모드: ${THEME_MODES.find((m) => m.key === mode)!.label} (누르면 바뀜)`} onPress={() => setThemeMode(NEXT_MODE[mode])} />
        <Tool icon="exit" label="로그아웃" onPress={logout} />
      </View>
    </View>
  );
}

function Badge({ n }: { n: number }) {
  const c = useColors();
  return (
    <View style={{ marginLeft: 'auto', minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 10.5, ...family.bold }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

function Tool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(st) => ({ width: 36, height: 36, borderRadius: radius.sm + 2, alignItems: 'center', justifyContent: 'center', backgroundColor: (st as { hovered?: boolean }).hovered ? c.surface : 'transparent' })}>
      <Icon name={icon} color={c.sub} size={19} />
    </Pressable>
  );
}
