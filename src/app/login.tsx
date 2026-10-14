import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { actions, me } from '@/core/store';
import { serverEnabled } from '@/core/supabase';
import { Button, Input, Notice, Sub, T } from '@/ui/kit';
import { MAX_WIDTH, space, useColors } from '@/ui/theme';

export default function LoginScreen() {
  const c = useColors();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const res = await actions.signIn(loginId, password);
    setBusy(false);
    if (!res.ok) return setError(res.reason);
    router.replace(me().role === 'client' ? '/home' : '/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <T size="title" bold color={c.accent}>라잇나우</T>
          <View style={{ marginBottom: space.xl }} />
          <Input label="아이디" autoCapitalize="none" autoCorrect={false} value={loginId} onChangeText={setLoginId} />
          <Input label="비밀번호" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} />
          {error ? <Notice text={error} /> : null}
          <Button label={busy ? '로그인 중' : '로그인'} onPress={submit} disabled={!loginId || !password || busy} />
          <View style={{ marginTop: space.lg, maxWidth: MAX_WIDTH }}>
            {__DEV__ && !serverEnabled ? <Sub>개발용: admin / admin1234 · staff / staff1234 · lawyer / lawyer1234 · client / client1234</Sub> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
