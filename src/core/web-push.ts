// PC·웹 브라우저 알림 (웹 푸시). 크롬·엣지·사파리에서 '알림 받기'를 켜면 창을 닫아도 새 메시지·기일 알림이 옵니다.
// 알림 허용 창은 사용자가 버튼을 눌렀을 때만 띄웁니다(브라우저 규칙). 이미 허용한 브라우저는 로그인할 때 자동으로 등록합니다.
import { Platform } from 'react-native';

import { onBeforeSignOut } from './store';
import { supabase } from './supabase';

const VAPID = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type WebPushState = 'unsupported' | 'default' | 'granted' | 'denied';

export function webPushState(): WebPushState {
  if (Platform.OS !== 'web' || !supabase || !VAPID || typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission as WebPushState;
}

async function subscribe(): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID }));
  const json = sub.toJSON();
  const { error } = await supabase!.rpc('register_web_push', { p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '' });
  return !error;
}

/** '알림 받기' 버튼: 허용 창을 띄우고 이 브라우저를 등록합니다 */
export async function enableWebPush(): Promise<WebPushState> {
  if (webPushState() === 'unsupported') return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm === 'granted') await subscribe().catch(() => false);
  return perm as WebPushState;
}

/** 로그인할 때: 이미 허용한 브라우저면 조용히 다시 등록 (계정이 바뀌었을 수 있음) */
export async function resumeWebPush(): Promise<void> {
  if (webPushState() === 'granted') await subscribe().catch(() => false);
}

if (Platform.OS === 'web') {
  onBeforeSignOut(async () => {
    if (webPushState() !== 'granted') return;
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) await supabase?.rpc('unregister_web_push', { p_endpoint: sub.endpoint });
  });
}
