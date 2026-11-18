// 공통 화면 부품
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROOM_MODE_INFO } from '@/core/rooms';
import type { RoomMode } from '@/core/types';
import { Icon, type IconName } from './icons';
import { Press } from './motion';
import { family, font, MAX_WIDTH, radius, space, tracking, useColors, useElevation, type Colors } from './theme';
import { useLayout } from './web-frame';

/** PC 구성에서 본문 최대 폭 (모바일 구성은 MAX_WIDTH). SKYZAI 송무와 같이 왼쪽부터 채우고 이 폭을 넘지 않습니다. */
export const DESKTOP_MAX_WIDTH = 1280;

/**
 * 화면 틀. 모바일은 제목 + 본문(가운데, 최대 720px). PC 구성은 왼쪽 메뉴 옆에서 왼쪽 정렬로 넓게(최대 1280px, 여백 32px) 펼치고 제목은 20px.
 * wide: 폭 제한 없이 꽉 채움 (대화방처럼 2단 구성 안에 들어가는 화면)
 */
export function Screen({ title, subtitle, leading, children, right, back, scroll = true, wide }: { title?: string; /** 제목 아래 작은 글 (대화방: 참여 n명) */ subtitle?: string; /** 제목 앞 요소 (대화방: 사진) */ leading?: ReactNode; children: ReactNode; right?: ReactNode; back?: boolean; scroll?: boolean; wide?: boolean }) {
  const c = useColors();
  const { desktop } = useLayout();
  const body = (
    <View style={[styles.inner, desktop && { paddingHorizontal: space.xxl, maxWidth: wide ? ('100%' as const) : DESKTOP_MAX_WIDTH, alignSelf: 'flex-start' }]}>
      {title ? (
        <View style={[styles.header, desktop && { paddingTop: 24, paddingBottom: 20 }, desktop && wide && { borderBottomWidth: 1, borderBottomColor: c.line, marginBottom: space.sm, marginHorizontal: -space.xxl, paddingHorizontal: space.xxl, paddingTop: 14, paddingBottom: 14 }]}>
          {back ? (
            <Pressable
              accessibilityLabel="뒤로"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              hitSlop={8}
              style={(st) => ({ width: 36, height: 36, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center', marginLeft: -8, marginRight: space.xs, backgroundColor: (st as { hovered?: boolean }).hovered ? c.surface : 'transparent', opacity: st.pressed ? 0.6 : 1 })}>
              <Icon name="back" color={c.text} size={22} />
            </Pressable>
          ) : null}
          {leading ? <View style={{ marginRight: space.sm + 2 }}>{leading}</View> : null}
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text style={[styles.title, (desktop || subtitle) && { fontSize: font.h2 - 2, letterSpacing: tracking.h2, ...family.bold }, { color: c.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <Text numberOfLines={1} style={{ ...family.regular, fontSize: font.small - 0.5, color: c.faint, marginTop: 1 }}>{subtitle}</Text> : null}
          </View>
          <View style={{ marginLeft: 'auto', paddingLeft: space.sm }}>{right}</View>
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
    </SafeAreaView>
  );
}

export function T({ children, size = 'body', color, bold, style }: { children: ReactNode; size?: keyof typeof font; color?: string; bold?: boolean; style?: object }) {
  const c = useColors();
  const heading = size === 'title' || size === 'h2' || size === 'h3';
  return <Text style={[{ fontSize: font[size], color: color ?? c.text, ...(bold ? family.bold : family.regular), lineHeight: font[size] * (heading ? 1.3 : 1.45), letterSpacing: heading ? tracking[size] : undefined }, style]}>{children}</Text>;
}

export function Sub({ children }: { children: ReactNode }) {
  const c = useColors();
  return <T size="small" color={c.sub}>{children}</T>;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: space.xl + 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm + 2, paddingHorizontal: 2 }}>
        <Text style={{ ...family.bold, fontSize: font.h3, color: c.text, letterSpacing: tracking.h3 }}>{title}</Text>
        <View style={{ marginLeft: 'auto' }}>{right}</View>
      </View>
      {children}
    </View>
  );
}

/**
 * 카드. 기본은 흰 면 위의 회색 칸(그림자 없음, 토스식). raised: 회색 바닥 위에 올리는 흰 판(1px 선).
 * flat 은 예전 이름 — 기본과 같음.
 */
export function Card({ children, onPress, style, raised }: { children: ReactNode; onPress?: () => void; style?: ViewStyle; flat?: boolean; raised?: boolean }) {
  const c = useColors();
  const lift = useElevation();
  const base: ViewStyle = raised ? lift : { backgroundColor: c.surface };
  const s: ViewStyle = { borderRadius: radius.lg, padding: space.lg + 2, marginBottom: space.sm + 2, ...base, ...(style as ViewStyle) };
  return onPress ? (
    <Press onPress={onPress} scale={0.98} style={({ hovered }) => ({ ...s, ...(hovered ? { backgroundColor: raised ? c.hover : c.lineStrong } : null) })}>
      {children}
    </Press>
  ) : (
    <View style={s}>{children}</View>
  );
}

/** 버튼. primary=붉은 채움(화면에 하나), soft=연한 붉은 면, ghost=면 없음, plain=회색 면(보조), dark=검정 채움 */
export function Button({ label, onPress, kind = 'primary', disabled, small, icon }: { label: string; onPress: () => void; kind?: 'primary' | 'soft' | 'ghost' | 'plain' | 'dark'; disabled?: boolean; small?: boolean; icon?: IconName }) {
  const c = useColors();
  const palette = {
    primary: { bg: c.accent, hover: c.accentStrong, fg: '#FFFFFF' },
    soft: { bg: c.accentSoft, hover: c.accentSoft, fg: c.accent },
    ghost: { bg: 'transparent', hover: c.surface, fg: c.text },
    plain: { bg: c.surface, hover: c.lineStrong, fg: c.text },
    dark: { bg: c.text, hover: c.sub, fg: c.bg },
  }[kind];
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      scale={0.97}
      style={({ pressed, hovered }) => ({
        flexDirection: 'row',
        gap: 6,
        backgroundColor: pressed || hovered ? palette.hover : palette.bg,
        borderRadius: small ? radius.sm + 2 : radius.md + 2,
        height: small ? 38 : 54,
        paddingHorizontal: small ? space.md + 2 : space.xl,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed && kind === 'soft' ? 0.7 : 1,
      })}>
      {icon ? <Icon name={icon} color={palette.fg} size={small ? 16 : 18} /> : null}
      <Text style={{ color: palette.fg, fontSize: small ? font.small + 1 : font.body + 1, ...family.semibold, letterSpacing: tracking.body }}>{label}</Text>
    </Press>
  );
}

// PC(웹)에서 엔터 = 보내기, Shift+엔터 = 줄바꿈. 한글 조합 중 엔터는 무시합니다(조합이 끝난 뒤 한 번 더 오는 엔터로 보냄).
// 폰은 엔터가 줄바꿈 그대로입니다.
type KeyEvent = { preventDefault?: () => void; nativeEvent: { key: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number } };
export function enterToSend(send: () => void): Pick<TextInputProps, 'onKeyPress'> {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyPress: (e) => {
      const k = e as unknown as KeyEvent;
      const n = k.nativeEvent;
      if (n.key !== 'Enter' || n.shiftKey || n.isComposing || n.keyCode === 229) return;
      k.preventDefault?.();
      send();
    },
  };
}

export function Input({ label, onFocus, onBlur, ...props }: TextInputProps & { label?: string }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={{ ...family.semibold, fontSize: font.small, color: c.sub, marginBottom: 8, marginLeft: 2 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.mute}
        {...props}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: c.surface,
            color: c.text,
            borderRadius: radius.md,
            borderWidth: 2,
            borderColor: focus ? c.accent : 'transparent',
            paddingHorizontal: space.lg - 2,
            paddingVertical: props.multiline ? space.md : 0,
            minHeight: props.multiline ? 120 : 54,
            fontSize: font.body + 1,
            ...family.regular,
            textAlignVertical: props.multiline ? 'top' : 'center',
            ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={(st) => ({ backgroundColor: active ? c.text : (st as { hovered?: boolean }).hovered ? c.lineStrong : c.surface, borderRadius: radius.pill, height: 36, paddingHorizontal: space.lg - 2, justifyContent: 'center', marginRight: space.sm, marginBottom: space.sm, opacity: st.pressed ? 0.7 : 1 })}>
      <Text style={{ color: active ? c.bg : c.sub, fontSize: font.small + 1, ...family.semibold }}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{children}</View>;
}

export const BADGE_WIDTH = 68;

/** fixed: D-day·상태 표시처럼 목록에서 뒤 글자 줄이 맞도록 폭을 고정 */
export function Badge({ label, tone = 'accent', fixed }: { label: string; tone?: 'accent' | 'secure' | 'ai' | 'warn' | 'member' | 'plain'; fixed?: boolean }) {
  const c = useColors();
  const map = {
    accent: [c.accentSoft, c.accent],
    secure: [c.secureSoft, c.secure],
    ai: [c.aiSoft, c.ai],
    warn: [c.warnSoft, c.warn],
    member: [c.warnSoft, c.member],
    plain: [c.surface, c.sub],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 7, height: 22, justifyContent: 'center', alignSelf: fixed ? 'center' : 'flex-start', ...(fixed ? { width: BADGE_WIDTH, alignItems: 'center' as const } : {}) }}>
      <Text numberOfLines={1} style={{ color: fg, fontSize: font.tiny, ...family.semibold }}>{label}</Text>
    </View>
  );
}

/** 사건수행방(의뢰인이 있는 방) 표시. AI 참여는 따로 표시하지 않습니다 (승덕 2026-10-22). */
export function ModeBadge({ mode }: { mode: RoomMode }) {
  if (mode !== 'private') return null;
  return <Badge label="사건수행" tone="secure" />;
}

export function ModeBanner({ mode }: { mode: RoomMode }) {
  const c = useColors();
  if (mode !== 'private') return null;
  const info = ROOM_MODE_INFO[mode];
  const [bg, fg] = mode === 'private' ? [c.secureSoft, c.secure] : [c.aiSoft, c.ai];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <Icon name={mode === 'private' ? 'case' : 'spark'} color={fg} size={20} />
      <View style={{ flex: 1 }}>
        <T size="small" bold color={fg}>{info.label}</T>
      </View>
    </View>
  );
}

export function Notice({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'accent' }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: tone === 'warn' ? c.warnSoft : c.accentSoft, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg, marginBottom: space.md, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <Icon name="notice" color={tone === 'warn' ? c.warn : c.accent} size={18} />
      <View style={{ flex: 1 }}>
        <T size="small" color={tone === 'warn' ? c.warn : c.accent}>{text}</T>
      </View>
    </View>
  );
}

export function Row({ title, sub, right, onPress, left }: { title: string; sub?: string; right?: ReactNode; onPress?: () => void; left?: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={(st) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: space.sm + 2, paddingHorizontal: space.md, marginHorizontal: -space.md, borderRadius: radius.md + 2, gap: space.md, backgroundColor: (st as { hovered?: boolean }).hovered && onPress ? c.hover : 'transparent', opacity: st.pressed ? 0.6 : 1 })}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: font.body + 1, ...family.semibold, color: c.text, letterSpacing: tracking.body }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: font.small, ...family.regular, color: c.sub, lineHeight: font.small * 1.45 }}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <Icon name="chevron" color={c.mute} size={18} /> : null}
    </Pressable>
  );
}

/** 빈 상태: 왜 비었는지 한 줄, 필요하면 행동 하나. (icon 은 호환용 — 작게만 표시) */
export function Empty({ text, hint, icon, action }: { text: string; hint?: string; icon?: IconName; action?: { label: string; onPress: () => void } }) {
  const c = useColors();
  return (
    <View style={{ paddingVertical: space.xxl + 12, alignItems: 'center', gap: 6 }}>
      {icon ? <Icon name={icon} color={c.mute} size={28} /> : null}
      <Text style={{ ...family.semibold, fontSize: font.body, color: c.sub, textAlign: 'center', marginTop: icon ? space.sm : 0 }}>{text}</Text>
      {hint ? <Text style={{ ...family.regular, fontSize: font.small, color: c.faint, textAlign: 'center', lineHeight: 19 }}>{hint}</Text> : null}
      {action ? (
        <View style={{ marginTop: space.md }}>
          <Button small kind="soft" label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

/** 이름으로 정해지는 아바타 색 (라이트: 연한 면 + 짙은 글자, 다크: 짙은 면 + 밝은 글자). 같은 이름은 늘 같은 색. */
const AVATAR_TONES: { light: [string, string]; dark: [string, string] }[] = [
  { light: ['#FDEEF0', '#C41E3A'], dark: ['#3A1F25', '#F2838D'] }, // 붉은색
  { light: ['#E8F3FF', '#1B64DA'], dark: ['#1C2A42', '#7FB0F5'] }, // 파랑
  { light: ['#E5F6EE', '#03A061'], dark: ['#16302A', '#5FD3A3'] }, // 초록
  { light: ['#FFF3E0', '#D97706'], dark: ['#3A2A18', '#F5A95F'] }, // 주황
  { light: ['#F0ECFF', '#6E4CF5'], dark: ['#2B2548', '#B4A1FF'] }, // 보라
  { light: ['#E6F6F7', '#0E8A94'], dark: ['#163037', '#67CDE3'] }, // 청록
];
export function avatarTone(name: string, c: Colors): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const t = AVATAR_TONES[h % AVATAR_TONES.length];
  return c.bg === '#FFFFFF' ? t.light : t.dark;
}
export function Avatar({ name, tone, size = 44, group, uri, dot, badge }: { name: string; tone?: string; size?: number; group?: boolean; uri?: string; dot?: string; badge?: string }) {
  const c = useColors();
  const [bg, fg] = avatarTone(name, c);
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} accessibilityLabel={`${name} 프로필 사진`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone ?? bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: tone ? c.accent : fg, ...family.bold, fontSize: Math.round(size * (group ? 0.3 : 0.38)), letterSpacing: group ? -0.6 : -0.3 }}>{name.slice(0, group ? 2 : 1)}</Text>
        </View>
      )}
      {group ? (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: c.accent, borderWidth: 2, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="people" color="#FFFFFF" size={10} />
        </View>
      ) : null}
      {dot && !group ? (
        <View style={{ position: 'absolute', right: 0, bottom: 0, width: Math.max(10, size * 0.26), height: Math.max(10, size * 0.26), borderRadius: size, backgroundColor: dot, borderWidth: 2, borderColor: c.bg }} />
      ) : null}
      {badge && !group ? (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: Math.max(18, Math.round(size * 0.46)), height: Math.max(18, Math.round(size * 0.46)), borderRadius: size, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: Math.max(11, Math.round(size * 0.28)), lineHeight: Math.max(14, Math.round(size * 0.34)) }}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg, flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: space.md, paddingBottom: space.lg },
  title: { fontSize: font.title, ...family.heavy, flexShrink: 1, letterSpacing: tracking.title },
});
