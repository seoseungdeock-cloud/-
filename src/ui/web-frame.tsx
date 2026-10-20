// PC 웹: 처음에는 폰 메신저 크기로 열고, 이용자가 '나' 탭에서 크기를 바꿉니다 (이 기기에 기억).
// 폰 앱에서는 아무것도 하지 않습니다.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { useColors } from './theme';

export type FrameSize = 'phone' | 'wide' | 'full';
export const FRAME_SIZES: { key: FrameSize; label: string; width: number }[] = [
  { key: 'phone', label: '폰 크기', width: 440 },
  { key: 'wide', label: '넓게', width: 760 },
  { key: 'full', label: '전체 화면', width: Infinity },
];

const KEY = 'rightnow.frameSize';
const web = Platform.OS === 'web';
const listeners = new Set<() => void>();

function read(): FrameSize {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'wide' || v === 'full' ? v : 'phone';
  } catch {
    return 'phone';
  }
}
let current: FrameSize = web ? read() : 'full';

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

/** 화면이 실제로 쓰는 폭 (창 폭과 고른 크기 중 작은 쪽) */
export function useFrameWidth(): number {
  const { width } = useWindowDimensions();
  const size = useFrameSize();
  return Math.min(width, FRAME_SIZES.find((f) => f.key === size)!.width);
}

/** 설치한 PC 앱 창을 처음 열 때 폰 크기로 */
function fitInstalledWindow() {
  try {
    const w = globalThis as unknown as Window;
    if (!w.matchMedia?.('(display-mode: standalone)').matches || w.localStorage.getItem(`${KEY}.fitted`)) return;
    w.localStorage.setItem(`${KEY}.fitted`, '1');
    if (current === 'phone' && w.outerWidth > 600) w.resizeTo(460, Math.min(920, w.screen.availHeight));
  } catch {
    // 브라우저가 창 크기 바꾸기를 막으면 그대로
  }
}

export function WebFrame({ children }: { children: ReactNode }) {
  const c = useColors();
  const width = useFrameWidth();
  const { width: windowWidth } = useWindowDimensions();
  useEffect(() => {
    if (web) fitInstalledWindow();
  }, []);
  if (!web || width >= windowWidth) return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', backgroundColor: c.surface }}>
      <View style={{ width, flexShrink: 0, backgroundColor: c.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.line, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}
