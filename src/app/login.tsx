import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { autoLoginNow, saveLoginPrefs, savedLoginId, savedLoginIdNow } from '@/core/login-prefs';
import { actions, me } from '@/core/store';
import { serverEnabled } from '@/core/supabase';
import { Icon, type IconName } from '@/ui/icons';
import { Notice, Sub } from '@/ui/kit';
import { family, font, radius, space, useColors } from '@/ui/theme';

const MARK = require('../../assets/images/logo-mark.png');
const WORDMARK = require('../../assets/images/logo-text.png');

/** 대륜 상징 (로고 파일에서 오려 낸 것) */
export function AppMark({ width = 88 }: { width?: number }) {
  const c = useColors();
  return <Image source={MARK} accessibilityLabel="대륜 로고" style={{ width, height: width * (406 / 640), tintColor: c.accent }} resizeMode="contain" />;
}

function Field({ icon, right, ...props }: React.ComponentProps<typeof TextInput> & { icon: IconName; right?: React.ReactNode }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        backgroundColor: c.surface,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: focus ? c.accent : 'transparent',
        paddingHorizontal: space.md,
        marginBottom: space.sm + 2,
        height: 54,
      }}>
      <View style={{ flexShrink: 0 }}>
        <Icon name={icon} color={focus ? c.accent : c.faint} size={20} />
      </View>
      <TextInput
        placeholderTextColor={c.faint}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        {...props}
        style={{ flex: 1, minWidth: 0, height: '100%', color: c.text, fontSize: font.body, ...family.regular, outlineStyle: 'none' } as object}
      />
      {right}
    </View>
  );
}

function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Icon name="check" color="#FFFFFF" size={14} /> : null}
      </View>
      <Text style={{ color: c.sub, fontSize: font.small, ...family.regular }}>{label}</Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const c = useColors();
  const [loginId, setLoginId] = useState(savedLoginIdNow);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => !!savedLoginIdNow());
  const [auto, setAuto] = useState(autoLoginNow);
  // 폰: 저장된 아이디는 기기 저장소에서 읽어 옵니다
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void savedLoginId().then((id) => {
      if (!id) return;
      setLoginId((cur) => cur || id);
      setRemember(true);
    });
  }, []);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ready = !!loginId.trim() && !!password && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    const res = await actions.signIn(loginId, password);
    setBusy(false);
    if (!res.ok) return setError(res.reason);
    await saveLoginPrefs(remember ? loginId.trim() : null, auto);
    router.replace(me().role === 'client' ? '/home' : '/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.xl, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: space.xxl + space.sm }}>
            <AppMark width={120} />
            <Image source={WORDMARK} accessibilityLabel="법무법인(유한) 대륜" style={{ marginTop: space.xl, width: 220, height: 220 * (175 / 900), tintColor: c.text }} resizeMode="contain" />
          </View>

          <Field icon="me" placeholder="아이디" autoCapitalize="none" autoCorrect={false} autoComplete="username" value={loginId} onChangeText={setLoginId} returnKeyType="next" />
          <Field
            icon="lock"
            placeholder="비밀번호"
            secureTextEntry={!show}
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            returnKeyType="go"
            right={
              <Pressable accessibilityLabel={show ? '비밀번호 가리기' : '비밀번호 보기'} hitSlop={10} onPress={() => setShow((v) => !v)}>
                <Text style={{ color: c.sub, fontSize: font.small, ...family.semibold }}>{show ? '숨김' : '보기'}</Text>
              </Pressable>
            }
          />

          <View style={{ flexDirection: 'row', gap: space.xl, marginVertical: space.sm }}>
            <Check label="아이디 저장" on={remember} onPress={() => setRemember((v) => !v)} />
            <Check label="자동 로그인" on={auto} onPress={() => setAuto((v) => !v)} />
          </View>

          {error ? <View style={{ marginTop: space.sm }}><Notice text={error} /></View> : null}

          <Pressable
            accessibilityRole="button"
            disabled={!ready}
            onPress={submit}
            style={({ pressed }) => ({ marginTop: space.md, height: 54, borderRadius: radius.md, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: !ready ? 0.4 : pressed ? 0.8 : 1 })}>
            <Text style={{ color: '#FFFFFF', fontSize: font.body + 1, ...family.bold }}>{busy ? '로그인 중…' : '로그인'}</Text>
          </Pressable>

          {__DEV__ && !serverEnabled ? (
            <View style={{ marginTop: space.lg }}>
              <Sub>개발용: admin / admin1234 · staff / staff1234 · lawyer / lawyer1234 · client / client1234</Sub>
            </View>
          ) : null}
        </View>
        <Text style={{ textAlign: 'center', color: c.faint, fontSize: font.tiny, ...family.regular, paddingBottom: space.lg }}>© 법무법인(유한) 대륜</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
