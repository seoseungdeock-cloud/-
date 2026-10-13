// 공통 화면 부품
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ROOM_MODE_INFO } from '@/core/rooms';
import type { RoomMode } from '@/core/types';
import { Icon } from './icons';
import { family, font, MAX_WIDTH, radius, space, useColors } from './theme';

export function Screen({ title, children, right, back, scroll = true }: { title?: string; children: ReactNode; right?: ReactNode; back?: boolean; scroll?: boolean }) {
  const c = useColors();
  const body = (
    <View style={styles.inner}>
      {title ? (
        <View style={styles.header}>
          {back ? (
            <Pressable accessibilityLabel="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={{ marginRight: space.sm }}>
              <Icon name="back" color={c.text} />
            </Pressable>
          ) : null}
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ marginLeft: 'auto' }}>{right}</View>
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
  return <Text style={[{ fontSize: font[size], color: color ?? c.text, fontFamily: bold ? family.bold : family.regular, lineHeight: font[size] * 1.45 }, style]}>{children}</Text>;
}

export function Sub({ children }: { children: ReactNode }) {
  const c = useColors();
  return <T size="small" color={c.sub}>{children}</T>;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
        <T size="h2" bold>{title}</T>
        <View style={{ marginLeft: 'auto' }}>{right}</View>
      </View>
      {children}
    </View>
  );
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  const c = useColors();
  const s = [{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm }, style];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={s}>{children}</View>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled, small }: { label: string; onPress: () => void; kind?: 'primary' | 'soft' | 'ghost'; disabled?: boolean; small?: boolean }) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'soft' ? c.accentSoft : 'transparent';
  const fg = kind === 'primary' ? '#FFFFFF' : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.md,
        paddingVertical: small ? space.sm : space.md + 2,
        paddingHorizontal: small ? space.md : space.lg,
        alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}>
      <Text style={{ color: fg, fontSize: small ? font.small : font.body, fontFamily: family.bold }}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.md }}>
      {props.label ? <Sub>{props.label}</Sub> : null}
      <TextInput
        placeholderTextColor={c.faint}
        {...props}
        style={[
          { backgroundColor: c.surface, color: c.text, borderRadius: radius.md, padding: space.md, fontSize: font.body, fontFamily: family.regular, marginTop: props.label ? space.xs : 0, minHeight: props.multiline ? 96 : undefined, textAlignVertical: props.multiline ? 'top' : 'center' },
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
      style={{ backgroundColor: active ? c.text : c.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm - 2, marginRight: space.sm, marginBottom: space.sm }}>
      <Text style={{ color: active ? c.bg : c.text, fontSize: font.small, fontFamily: active ? family.semibold : family.regular }}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{children}</View>;
}

export function Badge({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'secure' | 'ai' | 'warn' | 'member' | 'plain' }) {
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
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: font.tiny, fontFamily: family.semibold }}>{label}</Text>
    </View>
  );
}

/** 방의 방식 표시. 만들 때부터 운영 중까지 같은 모양으로 보입니다. */
export function ModeBadge({ mode }: { mode: RoomMode }) {
  return <Badge label={mode === 'private' ? '사건수행' : '✦ AI 참여 중'} tone={mode === 'private' ? 'secure' : 'ai'} />;
}

export function ModeBanner({ mode }: { mode: RoomMode }) {
  const c = useColors();
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
    <View style={{ backgroundColor: tone === 'warn' ? c.warnSoft : c.accentSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.md }}>
      <T size="small" color={tone === 'warn' ? c.warn : c.accent}>{text}</T>
    </View>
  );
}

export function Row({ title, sub, right, onPress, left }: { title: string; sub?: string; right?: ReactNode; onPress?: () => void; left?: ReactNode }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md, opacity: pressed ? 0.6 : 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line })}>
      {left}
      <View style={{ flex: 1 }}>
        <T bold>{title}</T>
        {sub ? <Text numberOfLines={1} style={{ fontSize: font.small, fontFamily: family.regular, color: c.sub, lineHeight: font.small * 1.45 }}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <Icon name="chevron" color={c.faint} size={18} /> : null}
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: 'center' }}>
      <T color={c.faint}>{text}</T>
    </View>
  );
}

export function Avatar({ name, tone, size = 44, group }: { name: string; tone?: string; size?: number; group?: boolean }) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone ?? c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.accent, fontFamily: family.bold, fontSize: Math.round(size * 0.36) }}>{name.slice(0, group ? 2 : 1)}</Text>
      </View>
      {group ? (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: c.accent, borderWidth: 2, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="people" color="#FFFFFF" size={10} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg, flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: space.lg, paddingBottom: space.sm },
  title: { fontSize: font.title, fontFamily: family.heavy, flexShrink: 1 },
});
