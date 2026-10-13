import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { loggedIn } from '@/core/store';
import { FONT_FILES } from '@/ui/theme';
import { useApp } from '@/ui/use-app';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const signedIn = loggedIn(useApp());
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // 로그인하지 않으면 로그인 화면만 열립니다
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="room/[id]" />
          <Stack.Screen name="room/new" />
          <Stack.Screen name="room/create" />
          <Stack.Screen name="room/bundle/[id]" />
          <Stack.Screen name="contact/[id]" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="lawyer/[id]" />
          <Stack.Screen name="agent/meeting" />
          <Stack.Screen name="agent/knowledge" />
          <Stack.Screen name="agent/images" />
          <Stack.Screen name="agent/builder" />
          <Stack.Screen name="marketing" />
          <Stack.Screen name="membership" />
          <Stack.Screen name="backoffice" />
          <Stack.Screen name="recommend" />
          <Stack.Screen name="service/[name]" />
          <Stack.Screen name="board/[id]" />
          <Stack.Screen name="board/new" />
          <Stack.Screen name="board/notes" />
          <Stack.Screen name="board/reports" />
          <Stack.Screen name="board/note/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
