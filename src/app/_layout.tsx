import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { usePush } from '@/core/push';
import { resumeWebPush } from '@/core/web-push';
import { loggedIn, startServer } from '@/core/store';
import { HearingAlertModal } from '@/ui/hearing';
import { ImageViewerHost } from '@/ui/image-viewer';
import { SyncNotice } from '@/ui/sync-notice';
import { useApp } from '@/ui/use-app';
import { WebFrame } from '@/ui/web-frame';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const app = useApp();
  const signedIn = loggedIn(app);
  // 서버 연결 시 저장된 로그인을 확인한 뒤에 화면을 엽니다
  const ready = app.booted;
  usePush(signedIn && ready);
  useEffect(() => {
    if (signedIn && ready) void resumeWebPush();
  }, [signedIn, ready]);

  useEffect(() => {
    void startServer();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // 로그인하지 않으면 로그인 화면만 열립니다
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      {/* PC 웹: 처음에는 폰 메신저 크기 (나 탭에서 바꿈) */}
      <WebFrame>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="room/[id]" />
          <Stack.Screen name="room/new" />
          <Stack.Screen name="room/create" />
          <Stack.Screen name="room/bundle/[id]" />
          <Stack.Screen name="contact/[id]" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="open/new" />
          <Stack.Screen name="open/[id]" />
          <Stack.Screen name="lawyer/[id]" />
          <Stack.Screen name="agent/meeting" />
          <Stack.Screen name="agent/images" />
          <Stack.Screen name="marketing" />
          <Stack.Screen name="membership" />
          <Stack.Screen name="backoffice" />
          <Stack.Screen name="suggest/index" />
          <Stack.Screen name="auth-codes" />
          <Stack.Screen name="suggest/inbox" />
          <Stack.Screen name="recommend" />
          <Stack.Screen name="service/[name]" />
          <Stack.Screen name="board/[id]" />
          <Stack.Screen name="board/new" />
          <Stack.Screen name="board/notes" />
          <Stack.Screen name="board/reports" />
          <Stack.Screen name="board/note/[id]" />
          <Stack.Screen name="axiom/index" />
          <Stack.Screen name="axiom/council/index" />
          <Stack.Screen name="axiom/council/new" />
          <Stack.Screen name="axiom/council/[id]" />
          <Stack.Screen name="axiom/doc/index" />
          <Stack.Screen name="axiom/doc/new" />
          <Stack.Screen name="axiom/doc/[id]" />
          <Stack.Screen name="axiom/agent/index" />
          <Stack.Screen name="axiom/agent/form" />
          <Stack.Screen name="axiom/agent/chat" />
          <Stack.Screen name="axiom/agent/[slug]" />
          <Stack.Screen name="axiom/work/index" />
          <Stack.Screen name="axiom/work/[id]" />
          <Stack.Screen name="axiom/ledger" />
          <Stack.Screen name="axiom/settings" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      </WebFrame>
      {/* 기일 알람: 의뢰인·변호사 모두 확인할 때까지 어느 화면에서든 뜹니다 */}
      {signedIn ? <HearingAlertModal /> : null}
      {signedIn ? <ImageViewerHost /> : null}
      <SyncNotice />
    </ThemeProvider>
  );
}
