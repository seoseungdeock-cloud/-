// 스카이넷 상징·워드마크 (심볼 「하늘의 그물」 + Pretendard Bold 대문자 워드마크 — SKYZAI 와 같은 락업 규칙)
// 모양 데이터는 brand-data.ts (assets/brand/generate.py 로 생성). 여기서는 색만 입혀 SVG 로 그립니다.
//   잉크 = 글자색, 브랜드색 = accent. color 를 주면 한 색(예: 파란 바탕 위 흰색)으로.
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg';

import { LOCKUP, SYMBOL, WORDMARK, type BrandRole } from './brand-data';
import { useColors } from './theme';

function useBrandColors(color?: string, onDark?: boolean): Record<BrandRole, string> {
  const c = useColors();
  if (color) return { ink: color, primary: color };
  // 진한 남색 메뉴 위: 잉크는 흰색, 브랜드색은 메뉴용 밝은 파랑
  if (onDark) return { ink: c.navText, primary: c.navAccent };
  return { ink: c.text, primary: c.accent };
}

/** 심볼 「하늘의 그물」 — 원 하나를 같은 기울기의 밴드 셋으로 짠 것. 가운데 밴드가 파랑. 정사각. */
export function AppMark({ width = 88, color, onDark }: { width?: number; color?: string; onDark?: boolean }) {
  const fill = useBrandColors(color, onDark);
  return (
    <Svg width={width} height={width} viewBox="0 0 200 200" accessibilityLabel="스카이넷 로고">
      <Defs>
        <ClipPath id="skynet-disc">
          <Circle cx={100} cy={100} r={SYMBOL.radius} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#skynet-disc)">
        {SYMBOL.bands.map((b, i) => <Path key={i} d={b.d} fill={fill[b.role]} />)}
      </G>
    </Svg>
  );
}

/** 워드마크 — SKYNET. height 로 맞춥니다 (글자 잉크 높이). */
export function WordmarkText({ height = 20, color, onDark }: { height?: number; color?: string; onDark?: boolean }) {
  const fill = useBrandColors(color, onDark);
  const k = height / WORDMARK.height;
  return (
    <Svg width={WORDMARK.width * k} height={height} viewBox={`0 ${0} ${WORDMARK.width} ${WORDMARK.height}`} accessibilityLabel="SKYNET">
      <G transform={`translate(0 ${WORDMARK.top}) scale(1 -1)`}>
        {WORDMARK.segments.map((seg, i) => (
          <G key={i} transform={`translate(${seg.x} 0)`} fill={fill[seg.role]}>
            {seg.glyphs.map((g, j) => <Path key={j} d={g.d} transform={`translate(${g.x} 0)`} />)}
          </G>
        ))}
      </G>
    </Svg>
  );
}

/**
 * 앱 안의 로고: 심볼(N) + 워드마크(SKYNET). 심볼은 글자 높이와 같아 글자처럼 가볍게 앉습니다.
 * height 는 글자 높이 (사이드바 22, 로그인 판 26). textOnly 면 워드마크만, compact 면 심볼만.
 */
export function Wordmark({ compact, height = 22, color, textOnly, onDark }: { compact?: boolean; height?: number; color?: string; textOnly?: boolean; onDark?: boolean }) {
  if (compact) return <AppMark width={30} color={color} onDark={onDark} />;
  if (textOnly) return <WordmarkText height={height} color={color} onDark={onDark} />;
  const sym = height * LOCKUP.symRatio;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sym * LOCKUP.gapRatio }}>
      <AppMark width={sym} color={color} onDark={onDark} />
      <WordmarkText height={height} color={color} onDark={onDark} />
    </View>
  );
}
