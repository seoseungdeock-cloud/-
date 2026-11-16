// PC 앱(데스크톱 앱)으로 설치하기 — 웹 브라우저가 주는 설치 요청(beforeinstallprompt)을 붙잡아 두었다가 버튼을 누르면 띄웁니다.
// 크롬·엣지 PC 에서 동작하고, 이미 설치해서 앱 창으로 열었으면 'installed' 입니다. 폰 앱에서는 'unsupported'.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type InstallState = 'unsupported' | 'available' | 'installed';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: PromptEvent | undefined;
let state: InstallState = 'unsupported';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone) state = 'installed';
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e as PromptEvent;
      if (state !== 'installed') {
        state = 'available';
        emit();
      }
    });
    window.addEventListener('appinstalled', () => {
      deferred = undefined;
      state = 'installed';
      emit();
    });
  } catch {
    // 지원하지 않는 브라우저
  }
}

export function installState(): InstallState {
  return state;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}

/** 설치 창 띄우기. 사용자가 수락하면 true */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = undefined;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome !== 'accepted') {
    deferred = ev;
    return false;
  }
  return true;
}
