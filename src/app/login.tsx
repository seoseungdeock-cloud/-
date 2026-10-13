import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { actions } from '@/core/store';
import { Button, Input, Notice, Sub, T } from '@/ui/kit';
import { MAX_WIDTH, space, useColors } from '@/ui/theme';

export default function LoginScreen() {
  const c = useColors();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();

  const submit = () => {
    const res = actions.login(loginId, password);
    if (!res.ok) return setError(res.reason);
    router.replace('/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <T size="title" bold color={c.accent}>라잇나우</T>
          <View style={{ marginBottom: space.xl }}>
            <Sub>발급받은 계정으로 로그인하세요.</Sub>
          </View>
          <Input label="아이디" autoCapitalize="none" autoCorrect={false} value={loginId} onChangeText={setLoginId} />
          <Input label="비밀번호" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} />
          {error ? <Notice text={error} /> : null}
          <Button label="로그인" onPress={submit} disabled={!loginId || !password} />
          <View style={{ marginTop: space.lg, maxWidth: MAX_WIDTH }}>
            <Sub>계정은 관리자가 백오피스에서 발급합니다.</Sub>
            {__DEV__ ? <Sub>개발용: admin / admin1234 · staff / staff1234 · lawyer / lawyer1234 · client / client1234</Sub> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
