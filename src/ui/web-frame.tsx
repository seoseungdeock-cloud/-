// 화면 구성(웹·PC 앱 전용). 폰 앱에서는 늘 '모바일' 구성입니다.
//   자동     : 창 폭에 따라 — 1024px 이상 데스크톱(왼쪽 메뉴 + 넓은 화면), 768~1023 태블릿(아이콘 메뉴), 그 아래 모바일(아래 탭)
//   데스크톱 : 창이 좁아도 데스크톱 구성
//   모바일   : PC 에서도 폰 메신저 크기(504px)로 가운데에 띄움 (종전 기본값)
// 고른 값은 이 기기에 기억합니다.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { useColors } from './theme';

export type FrameSize = 'auto' | 'desktop' | 'phone';
export const FRAME_SIZES: { key: FrameSize; label: string; hint: string }[] = [
  { key: 'auto', label: '자동', hint: '창 폭에 맞춰 PC·모바일 구성을 고릅니다' },
  { key: 'desktop', label: '데스크톱', hint: '왼쪽 메뉴와 넓은 화면' },
  { key: 'phone', label: '모바일', hint: '폰 앱과 같은 화면을 가운데에 작게' },
];

/** 실제로 그려지는 구성 */
export type LayoutMode = 'phone' | 'tablet' | 'desktop';
export const PHONE_FRAME_WIDTH = 504;
export const SIDEBAR_WIDTH = 240;
export const RAIL_WIDTH = 64;
export const DESKTOP_MIN = 1024;
export const TABLET_MIN = 768;

const KEY = 'rightnow.frameSize';
const web = Platform.OS === 'web';
const listeners = new Set<() => void>();

function read(): FrameSize {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'desktop' || v === 'phone' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
let current: FrameSize = web ? read() : 'phone';

export function setFrameSize(size: FrameSize) {
  current = size;
  try {
    globalThis.localStorage?.setItem(KEY, size);
  } catch {
    // 저장이 막힌 브라우저: 이번에만 적용
  }
  listeners.forEach((fn) => fn());
}

export function useFrameSize(): FrameSize {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}

export function layoutOf(size: FrameSize, width: number): LayoutMode {
  if (!web) return 'phone';
  if (size === 'phone') return 'phone';
  // '데스크톱'을 골라도 창이 1024px 보다 좁으면 아이콘 메뉴(태블릿) 구성 — 2단 메신저가 들어갈 자리가 없어서
  if (size === 'desktop') return width >= DESKTOP_MIN ? 'desktop' : 'tablet';
  return width >= DESKTOP_MIN ? 'desktop' : width >= TABLET_MIN ? 'tablet' : 'phone';
}

/** 지금 화면 구성과 왼쪽 메뉴 폭. desktop: PC 구성(태블릿 포함, 왼쪽 메뉴 있음), split: 메신저를 목록|대화 2단으로 */
export function useLayout(): { mode: LayoutMode; width: number; navWidth: number; desktop: boolean; split: boolean } {
  const { width } = useWindowDimensions();
  const size = useFrameSize();
  const mode = layoutOf(size, width);
  const navWidth = mode === 'desktop' ? SIDEBAR_WIDTH : mode === 'tablet' ? RAIL_WIDTH : 0;
  return { mode, width, navWidth, desktop: mode !== 'phone', split: mode === 'desktop' };
}

/** 본문이 실제로 쓰는 폭 (모바일 구성은 폰 틀 폭, PC 구성은 메뉴를 뺀 폭) */
export function useFrameWidth(): number {
  const { mode, width, navWidth } = useLayout();
  if (!web) return width;
  if (mode === 'phone') return Math.min(width, PHONE_FRAME_WIDTH);
  return width - navWidth;
}

/** 설치한 PC 앱 창을 처음 열 때, '모바일' 구성을 골라 둔 사람이면 폰 크기로 */
function fitInstalledWindow() {
  try {
    const w = globalThis as unknown as Window;
    if (!w.matchMedia?.('(display-mode: standalone)').matches || w.localStorage.getItem(`${KEY}.fitted`)) return;
    w.localStorage.setItem(`${KEY}.fitted`, '1');
    if (current === 'phone' && w.outerWidth > 600) w.resizeTo(PHONE_FRAME_WIDTH + 20, Math.min(920, w.screen.availHeight));
  } catch {
    // 브라우저가 창 크기 바꾸기를 막으면 그대로
  }
}

/** 모바일 구성을 PC 에서 볼 때: 폰 틀을 가운데에 */
export function WebFrame({ children }: { children: ReactNode }) {
  const c = useColors();
  const { mode, width: windowWidth } = useLayout();
  useEffect(() => {
    if (web) fitInstalledWindow();
  }, []);
  if (!web || mode !== 'phone' || windowWidth <= PHONE_FRAME_WIDTH) return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', backgroundColor: c.page }}>
      <View style={{ width: PHONE_FRAME_WIDTH, flexShrink: 0, backgroundColor: c.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.lineStrong, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}
