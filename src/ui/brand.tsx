// 대륜 상징·스카이넷 워드마크
import { Image, Text, View } from 'react-native';

import { family, useColors } from './theme';

const MARK = require('../../assets/images/logo-mark.png');

/** 대륜 상징 (로고 파일에서 오려 낸 것) */
export function AppMark({ width = 88, color }: { width?: number; color?: string }) {
  const c = useColors();
  return <Image source={MARK} accessibilityLabel="대륜 로고" style={{ width, height: width * (406 / 640), tintColor: color ?? c.accent }} resizeMode="contain" />;
}

/** 상징 + 「스카이넷」 글자 (왼쪽 메뉴 머리) */
export function Wordmark({ compact }: { compact?: boolean }) {
  const c = useColors();
  if (compact) return <AppMark width={34} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <AppMark width={36} />
      <View>
        <Text style={{ ...family.bold, fontSize: 17, color: c.text, letterSpacing: -0.3 }}>스카이넷</Text>
        <Text style={{ ...family.regular, fontSize: 11, color: c.faint, marginTop: 1 }}>법무법인(유한) 대륜</Text>
      </View>
    </View>
  );
}
