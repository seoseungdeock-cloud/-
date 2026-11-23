import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { autoLoginNow, saveLoginPrefs, savedLoginId, savedLoginIdNow } from '@/core/login-prefs';
import { actions, me } from '@/core/store';
import { serverEnabled } from '@/core/supabase';
import { AppMark, Wordmark } from '@/ui/brand';
import { Icon, type IconName } from '@/ui/icons';
import { Sub } from '@/ui/kit';
import { family, font, radius, space, tracking, useColors, useScheme } from '@/ui/theme';

/** 웹은 JS 드라이버, 폰은 네이티브 드라이버 (transform·opacity 전용) */
const NATIVE = Platform.OS !== 'web';

/** 처음 뜰 때 아래에서 살짝 떠오르며 나타나는 묶음. delay(ms)로 순서를 줍니다. */
function Reveal({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: object }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** 배경의 은은한 빛 덩어리. 아주 천천히 숨 쉬듯 움직입니다. */
function Glow({ color, size, opacity, top, left, right, bottom, drift }: { color: string; size: number; opacity: number; top?: number; left?: number; right?: number; bottom?: number; drift: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(t, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const id = `glow-${drift}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        width: size,
        height: size,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -drift] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, drift * 0.8] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
        ],
      }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function Field({ label, icon, right, onChangeText, ...props }: React.ComponentProps<typeof TextInput> & { label: string; icon: IconName; right?: ReactNode }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  const f = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(f, { toValue: focus ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [f, focus]);
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={{ color: focus ? c.accent : c.sub, fontSize: font.tiny + 1, marginBottom: 6, marginLeft: 2, ...family.semibold }}>{label}</Text>
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm + 2,
          height: 56,
          paddingHorizontal: space.md + 2,
          borderRadius: radius.lg - 2,
          borderWidth: 1.5,
          borderColor: f.interpolate({ inputRange: [0, 1], outputRange: [c.line, c.accent] }),
          backgroundColor: f.interpolate({ inputRange: [0, 1], outputRange: [c.surface, c.bg] }),
          boxShadow: focus ? `0 6px 18px ${rgba(c.accent, 0.14)}` : '0 0 0 rgba(0,0,0,0)',
        }}>
        <Icon name={icon} color={focus ? c.accent : c.faint} size={20} />
        <TextInput
          placeholderTextColor={c.faint}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChangeText={onChangeText}
          {...props}
          style={{ flex: 1, minWidth: 0, height: '100%', color: c.text, fontSize: font.body, ...family.regular, outlineStyle: 'none' } as object}
        />
        {right}
      </Animated.View>
    </View>
  );
}

function Check({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  const s = useRef(new Animated.Value(1)).current;
  const press = () => {
    s.setValue(0.75);
    Animated.spring(s, { toValue: 1, friction: 4, tension: 160, useNativeDriver: NATIVE }).start();
    onPress();
  };
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={press} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Animated.View
        style={{
          width: 22,
          height: 22,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: on ? c.accent : c.line,
          backgroundColor: on ? c.accent : c.bg,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: s }],
        }}>
        {on ? <Icon name="check" color="#FFFFFF" size={14} /> : null}
      </Animated.View>
      <Text style={{ color: on ? c.text : c.sub, fontSize: font.small, ...family.semibold }}>{label}</Text>
    </Pressable>
  );
}

/** PC 넓은 창: 왼쪽 브랜드 판 (짙은 파랑, 로고·한 줄 소개) */
function BrandPanel() {
  return (
    <View style={{ width: '42%', maxWidth: 560, minWidth: 360, backgroundColor: '#1F3FD6', overflow: 'hidden', ...({ backgroundImage: 'linear-gradient(160deg, #3D6BFF 0%, #1A33B8 100%)' } as object) }}>
      <Glow color="#9DB8FF" size={620} opacity={0.4} top={-260} right={-220} drift={30} />
      <Glow color="#DCE6FF" size={420} opacity={0.2} bottom={-200} left={-160} drift={-22} />
      <View style={{ flex: 1, padding: 48, justifyContent: 'space-between' }}>
        <Reveal delay={0}>
          <Wordmark height={26} color="#FFFFFF" />
        </Reveal>
        <Reveal delay={120}>
          <Text style={{ color: '#FFFFFF', fontSize: 40, lineHeight: 50, letterSpacing: tracking.title, ...family.heavy }}>일은 여기서{'\n'}이야기합니다.</Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 24, marginTop: 20, ...family.regular }}>대화, 사건, 기일, 할 일, 파일.{'\n'}흩어져 있던 업무를 한 화면에 모았습니다.</Text>
        </Reveal>
        <Reveal delay={240}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, ...family.regular }}>© SKYNET · 구성원 전용</Text>
        </Reveal>
      </View>
    </View>
  );
}
/** 16진 색에 투명도를 더한 rgba 문자열 */
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function LoginScreen() {
  const c = useColors();
  const dark = useScheme() === 'dark';
  const { width } = useWindowDimensions();
  const split = Platform.OS === 'web' && width >= 960;
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

  // 버튼 눌림(살짝 줄어듦)·실패 시 좌우 흔들림·오류 글 나타남
  const press = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const errorIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(errorIn, { toValue: error ? 1 : 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }).start();
  }, [errorIn, error]);
  const doShake = () => {
    shake.setValue(0);
    Animated.sequence(
      [-10, 10, -7, 7, -3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, easing: Easing.linear, useNativeDriver: NATIVE })),
    ).start();
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    const res = await actions.signIn(loginId, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      doShake();
      return;
    }
    await saveLoginPrefs(remember ? loginId.trim() : null, auto);
    router.replace('/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, flexDirection: 'row' }}>
      {split ? <BrandPanel /> : null}
      <View style={{ flex: 1, overflow: 'hidden' }}>
      {split ? null : <Glow color={c.accent} size={420} opacity={dark ? 0.32 : 0.22} top={-150} right={-140} drift={24} />}
      {split ? null : <Glow color={c.ai} size={360} opacity={dark ? 0.26 : 0.16} bottom={-120} left={-150} drift={-18} />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxl, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
            <Reveal delay={0} style={{ marginBottom: space.xxl }}>
              {split ? null : (
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${rgba(c.accent, dark ? 0.28 : 0.22)}` }}>
                  <AppMark width={34} color="#FFFFFF" />
                </View>
              )}
              <Text style={{ marginTop: split ? 0 : space.xl, color: c.sub, fontSize: font.small + 1, ...family.semibold }}>{split ? '대륜탑 계정으로 로그인' : 'SKYNET'}</Text>
              <Text style={{ marginTop: space.xs, color: c.text, fontSize: 32, lineHeight: 42, letterSpacing: tracking.title, ...family.heavy }}>{split ? '로그인' : '로그인'}</Text>
            </Reveal>

            <Animated.View style={{ transform: [{ translateX: shake }] }}>
              <Reveal delay={90}>
                <Field label="대륜탑 사번" icon="me" placeholder="사번(아이디)" autoCapitalize="none" autoCorrect={false} autoComplete="username" value={loginId} onChangeText={(v) => { setLoginId(v); setError(undefined); }} returnKeyType="next" />
              </Reveal>
              <Reveal delay={160}>
                <Field
                  label="비밀번호"
                  icon="lock"
                  placeholder="비밀번호 입력"
                  secureTextEntry={!show}
                  autoComplete="current-password"
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(undefined); }}
                  onSubmitEditing={submit}
                  returnKeyType="go"
                  right={
                    <Pressable accessibilityLabel={show ? '비밀번호 가리기' : '비밀번호 보기'} hitSlop={10} onPress={() => setShow((v) => !v)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 2 })}>
                      <Icon name={show ? 'hide' : 'eye'} color={c.faint} size={20} />
                    </Pressable>
                  }
                />
              </Reveal>
            </Animated.View>

            <Reveal delay={230}>
              <View style={{ flexDirection: 'row', gap: space.xl, marginTop: space.xs, marginBottom: space.lg }}>
                <Check label="아이디 저장" on={remember} onPress={() => setRemember((v) => !v)} />
                <Check label="자동 로그인" on={auto} onPress={() => setAuto((v) => !v)} />
              </View>
            </Reveal>

            {error ? (
              <Animated.View
                style={{
                  opacity: errorIn,
                  transform: [{ translateY: errorIn.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  backgroundColor: c.warnSoft,
                  borderRadius: radius.md,
                  paddingHorizontal: space.md,
                  paddingVertical: space.md - 2,
                  marginBottom: space.md,
                }}>
                <Icon name="notice" color={c.warn} size={18} />
                <Text style={{ flex: 1, color: c.warn, fontSize: font.small, lineHeight: font.small * 1.45, ...family.semibold }}>{error}</Text>
              </Animated.View>
            ) : null}

            <Reveal delay={300}>
              <Pressable
                accessibilityRole="button"
                disabled={!ready}
                onPress={submit}
                onPressIn={() => Animated.spring(press, { toValue: 0.97, friction: 6, tension: 220, useNativeDriver: NATIVE }).start()}
                onPressOut={() => Animated.spring(press, { toValue: 1, friction: 5, tension: 180, useNativeDriver: NATIVE }).start()}>
                <Animated.View
                  style={{
                    height: 56,
                    borderRadius: radius.lg - 2,
                    backgroundColor: ready || busy ? c.accent : c.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: space.sm,
                    transform: [{ scale: press }],
                    boxShadow: ready ? `0 10px 24px ${rgba(c.accent, 0.32)}` : '0 0 0 rgba(0,0,0,0)',
                  }}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
                  <Text style={{ color: ready || busy ? '#FFFFFF' : c.faint, fontSize: font.body + 1, letterSpacing: 0.2, ...family.bold }}>{busy ? '로그인 중' : '로그인'}</Text>
                </Animated.View>
              </Pressable>
            </Reveal>

            {__DEV__ && !serverEnabled ? (
              <View style={{ marginTop: space.lg }}>
                <Sub>체험 계정 — admin / admin1234 · lawyer / lawyer1234 · staff / staff1234 · client / client1234</Sub>
              </View>
            ) : null}
          </View>
          {split ? null : (
            <Reveal delay={420}>
              <Text style={{ textAlign: 'center', color: c.faint, fontSize: font.tiny, ...family.regular, paddingBottom: space.lg }}>© SKYNET · 구성원 전용</Text>
            </Reveal>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
