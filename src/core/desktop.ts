// PC 앱(Electron, desktop/ 폴더) 안에서 돌고 있을 때만 쓰는 다리.
// PC 앱의 preload 가 window.skynetDesktop 을 만들어 두고, 여기서는 (1) 안 읽은 수 → 배지, (2) 새 메시지 → 운영체제 알림,
// (3) 알림 클릭 → 그 방 열기를 이어 줍니다. 브라우저·폰에서는 window.skynetDesktop 이 없어 전부 그냥 지나갑니다.
import { Platform } from 'react-native';
import type { Message, Room, User } from './types';

type Bridge = {
  platform: string;
  setBadge(count: number): void;
  notify(opts: { title: string; body: string; roomId?: string; silent?: boolean }): void;
  onOpenRoom(fn: (roomId: string) => void): () => void;
  focus(): void;
  info(): Promise<{ platform: string; version: string; url: string }>;
};

export function desktopBridge(): Bridge | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return (window as unknown as { skynetDesktop?: Bridge }).skynetDesktop;
}
export const isDesktopApp = () => !!desktopBridge();

let lastBadge = -1;
/** 안 읽은 수가 바뀔 때만 PC 앱에 알림 */
export function setDesktopBadge(n: number): void {
  const b = desktopBridge();
  if (!b || n === lastBadge) return;
  lastBadge = n;
  b.setBadge(n);
}

/** 새로 들어온 남의 메시지 → 운영체제 알림 (방 알림 설정 존중: 꺼짐이면 없음, 멘션만이면 나를 불렀을 때만) */
export function desktopNotifyMessage(m: Message, room: Room, me: User, sender: User | undefined, preview: string): void {
  const b = desktopBridge();
  if (!b) return;
  const level = room.notify?.[me.id] ?? 'all';
  if (level === 'off') return;
  if (level === 'mention' && !(m.mentions ?? []).some((x) => x === me.id || x === 'all')) return;
  const who = sender?.nickname ?? '알림';
  const title = room.memberIds.length > 2 ? `${who} · ${room.title}` : who;
  b.notify({ title, body: preview, roomId: room.id });
}
