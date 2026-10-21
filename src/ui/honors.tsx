import { Image, Platform, Text, View, type ViewStyle } from 'react-native';

import { family, radius, space } from '@/ui/theme';

// 대륜 아너스: 의뢰인 멤버십 전용 금색 디자인 (밝은/어두운 모드와 상관없이 같은 색)
export const GOLD = {
  bg: '#14110D',
  card: '#1D1913',
  line: 'rgba(201,164,92,0.32)',
  gold: '#C9A45C',
  light: '#EBD7A6',
  deep: '#8E6B2E',
  text: '#F4EEE2',
  sub: '#A99D88',
};

export const HONORS = '대륜 아너스';

const MARK = require('../../assets/images/logo-mark.png');

/** 웹에서만 금박 느낌의 그라데이션 (폰은 단색) */
export const goldSheen = (from: string, to: string): ViewStyle => (Platform.OS === 'web' ? ({ backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` } as ViewStyle) : {});

export function HonorsMark({ width = 56, color = GOLD.gold }: { width?: number; color?: string }) {
  return <Image source={MARK} accessibilityLabel="대륜 로고" style={{ width, height: width * (406 / 640), tintColor: color }} resizeMode="contain" />;
}

/** 멤버 카드 모양 (멤버십 화면·나 탭) */
export function HonorsCard({ name, member, compact }: { name: string; member: boolean; compact?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: GOLD.card,
        ...goldSheen('#2A231A', '#14110D'),
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: GOLD.line,
        padding: compact ? space.lg : space.xl,
        aspectRatio: compact ? undefined : 1.586,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}>
      <View style={{ position: 'absolute', right: -40, bottom: -50, opacity: 0.08 }}>
        <HonorsMark width={compact ? 180 : 260} color={GOLD.light} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <HonorsMark width={compact ? 30 : 38} />
        <View>
          <Text style={{ color: GOLD.gold, fontSize: 10, letterSpacing: 3, ...family.bold }}>DAERYUN HONORS</Text>
          <Text style={{ color: GOLD.text, fontSize: compact ? 15 : 17, letterSpacing: 1, ...family.bold }}>{HONORS}</Text>
        </View>
        {member ? (
          <View style={{ marginLeft: 'auto', borderWidth: 1, borderColor: GOLD.gold, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color: GOLD.light, fontSize: 11, letterSpacing: 1, ...family.semibold }}>MEMBER</Text>
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: compact ? space.md : 0 }}>
        <View style={{ height: 1, backgroundColor: GOLD.line, marginBottom: compact ? space.sm : space.md }} />
        <Text style={{ color: GOLD.sub, fontSize: 11, letterSpacing: 2, ...family.semibold }}>{member ? 'HONORED CLIENT' : 'BY INVITATION'}</Text>
        <Text style={{ color: GOLD.light, fontSize: compact ? 18 : 22, marginTop: 2, letterSpacing: 0.5, ...family.bold }}>{member ? `${name} 님` : '내 사건을 끝까지, 품격 있게'}</Text>
      </View>
    </View>
  );
}
