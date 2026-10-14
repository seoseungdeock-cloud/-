// 폰 푸시: 로그인하면 이 폰의 푸시 주소를 서버에 등록하고, 푸시(기일·새 메시지)를 누르면 그 방을 엽니다.
// 웹·시뮬레이터, 그리고 EAS 프로젝트(extra.eas.projectId)가 아직 없는 빌드에서는 아무것도 하지 않습니다.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { onBeforeSignOut } from './store';
import { supabase } from './supabase';

const native = Platform.OS === 'ios' || Platform.OS === 'android';
let myToken: string | undefined;

if (native) {
  // 앱을 보고 있을 때: 기일 푸시는 위에 띄우고, 새 메시지는 화면에 바로 들어오므로 띄우지 않습니다
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const show = n.request.content.data?.kind !== 'message';
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
  onBeforeSignOut(async () => {
    if (!supabase || !myToken) return;
    const token = myToken;
    myToken = undefined;
    await supabase.rpc('unregister_push_token', { p_token: token });
  });
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** 로그인한 뒤 한 번: 알림 허용을 묻고 푸시 주소를 등록합니다. 거절하거나 못 받으면 조용히 넘어갑니다 (앱 안 알람 창은 그대로). */
export async function registerPush(): Promise<void> {
  if (!native || !supabase || !Device.isDevice || !projectId()) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('hearings', {
      name: '기일 알림',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('messages', { name: '새 메시지', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (!error) myToken = token;
}

/** 로그인 상태에서 푸시 등록, 그리고 푸시를 누르면 그 방으로 이동 */
export function usePush(signedIn: boolean): void {
  const response = native ? Notifications.useLastNotificationResponse() : undefined;

  useEffect(() => {
    if (signedIn) void registerPush().catch(() => undefined);
  }, [signedIn]);

  useEffect(() => {
    const roomId = response?.notification.request.content.data?.roomId;
    if (!signedIn || typeof roomId !== 'string') return;
    router.push({ pathname: '/room/[id]', params: { id: roomId } });
    void Notifications.clearLastNotificationResponseAsync();
  }, [signedIn, response]);
}
