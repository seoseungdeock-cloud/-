// 고르기 부품 — 표시가 미끄러져 따라갑니다.
//   ChipBar     : 둥근 알약 칩 한 줄 (전체·안 읽음·1:1…). 고른 칩 뒤에 채운 알약이 스프링으로 이동. 칩 옆 점은 '새 소식 있음'.
//   SegmentBar  : 회색 홈 안에서 흰 칸이 미끄러지는 두세 개짜리 전환 (목록/달력)
//   UnderlineTabs 는 contacts.tsx 에 있으며 같은 방식으로 밑줄이 미끄러집니다.
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { Slide } from './motion';
import { family, radius, space, useColors } from './theme';

type Box = { x: number; w: number };
export function useBoxes<K extends string>() {
  const [boxes, setBoxes] = useState<Partial<Record<K, Box>>>({});
  const measure = (k: K) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setBoxes((cur) => (cur[k]?.x === x && cur[k]?.w === width ? cur : { ...cur, [k]: { x, w: width } }));
  };
  return { boxes, measure };
}

/** tone: dark = 고른 칩이 진한 글자색 바탕(기본), accent = 파랑 바탕, nav = 남색 띠 위(흰 반투명) */
export function ChipBar<K extends string>({ items, value, onChange, dots, tone = 'dark', scroll = true, size = 'md' }: { items: [K, string][]; value: K; onChange: (k: K) => void; dots?: Partial<Record<K, boolean>>; tone?: 'dark' | 'accent' | 'nav'; scroll?: boolean; size?: 'sm' | 'md' }) {
  const c = useColors();
  const { boxes, measure } = useBoxes<K>();
  const on = boxes[value];
  const h = size === 'sm' ? 30 : 34;
  const fill = tone === 'nav' ? 'rgba(255,255,255,0.18)' : tone === 'accent' ? c.accent : c.text;
  const onText = tone === 'nav' ? c.navText : tone === 'accent' ? '#FFFFFF' : c.bg;
  const offText = tone === 'nav' ? c.navMute : c.sub;
  const row = (
    <View style={{ flexDirection: 'row', gap: 6, position: 'relative' }}>
      <Slide x={on?.x ?? 0} width={on?.w ?? 0} height={h} color={fill} />
      {items.map(([k, label]) => {
        const active = k === value;
        return (
          <Pressable
            key={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onLayout={measure(k)}
            onPress={() => onChange(k)}
            style={({ pressed }) => ({ height: h, paddingHorizontal: size === 'sm' ? 11 : 13, borderRadius: radius.pill, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ ...(active ? family.bold : family.semibold), fontSize: size === 'sm' ? 12.5 : 13.5, letterSpacing: -0.2, color: active ? onText : offText }}>{label}</Text>
            {dots?.[k] && !active ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone === 'nav' ? c.navAccent : c.accent }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
  if (!scroll) return row;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg }} keyboardShouldPersistTaps="handled">
      {row}
    </ScrollView>
  );
}

export function SegmentBar<K extends string>({ items, value, onChange }: { items: [K, string][]; value: K; onChange: (k: K) => void }) {
  const c = useColors();
  const { boxes, measure } = useBoxes<K>();
  const on = boxes[value];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 3, position: 'relative' }}>
      <Slide x={(on?.x ?? 0) + 3} width={on?.w ?? 0} height={26} color={c.bg} style={{ top: 3 }} />
      {items.map(([k, label]) => {
        const active = k === value;
        return (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: active }} onLayout={measure(k)} onPress={() => onChange(k)} style={{ paddingHorizontal: space.md, height: 26, justifyContent: 'center', borderRadius: radius.pill }}>
            <Text style={{ ...(active ? family.bold : family.semibold), fontSize: 13, color: active ? c.text : c.sub }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
