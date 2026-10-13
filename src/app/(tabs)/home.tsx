import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import home from '@/data/home.json';
import { Icon } from '@/ui/icons';
import { Badge, T } from '@/ui/kit';
import { family, MAX_WIDTH, radius, space, useColors } from '@/ui/theme';

// 의뢰인 첫 화면 (홈 대시보드)
export default function HomeScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, MAX_WIDTH) - space.lg * 2;
  const [slide, setSlide] = useState(0);
  const [allFields, setAllFields] = useState(false);
  const fields = allFields ? home.fields : home.fields.slice(0, 12);
  const card = { backgroundColor: c.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line };

  const banners = [
    { top: '변호사 상담부터 법률 서류 제출까지 한 번에!', title: 'GRAND OPENING', cta: '변호사 찾아보기', go: () => router.push('/find') },
    { top: '사건이 끝날 때까지 챙겨 드립니다', title: '라잇나우 멤버십', cta: '혜택 보기', go: () => router.push('/membership') },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
        <Text style={{ fontFamily: family.heavy, fontSize: 22, color: c.accent, letterSpacing: 0.5 }}>RIGHTS NOW</Text>
        <Pressable accessibilityLabel="검색" onPress={() => router.push('/find')} style={{ marginLeft: 'auto' }} hitSlop={12}>
          <Icon name="search" color={c.text} size={26} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg }}>
          <Text style={{ fontFamily: family.heavy, fontSize: 28, lineHeight: 38, color: c.text, marginTop: space.sm }}>
            긴급한 법률 상담{'\n'}
            <Text style={{ color: c.accent }}>라잇나우</Text>가 필요해!
          </Text>

          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            {[
              { label: '변호사\n선택하기', icon: 'search' as const, go: () => router.push('/find') },
              { label: '변호사\n추천받기', icon: 'work' as const, go: () => router.push('/recommend') },
            ].map((b) => (
              <Pressable key={b.label} onPress={b.go} style={({ pressed }) => [card, { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={b.icon} color={c.accent} size={34} />
                </View>
                <Text style={{ fontFamily: family.bold, fontSize: 20, lineHeight: 28, textAlign: 'center', color: c.text }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / inner))}
            onScroll={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / inner))}
            scrollEventThrottle={64}
            style={{ marginTop: space.lg, borderRadius: radius.lg }}>
            {banners.map((b) => (
              <View key={b.title} style={{ width: inner, backgroundColor: c.accentSoft, borderRadius: radius.lg, padding: space.xl, gap: space.sm }}>
                <T size="small" color={c.sub}>{b.top}</T>
                <Text style={{ fontFamily: family.heavy, fontSize: 30, color: c.accent }}>{b.title}</Text>
                <Pressable onPress={b.go} style={{ alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, marginTop: space.sm }}>
                  <Text style={{ color: '#FFFFFF', fontFamily: family.bold }}>{b.cta}</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <View style={{ alignSelf: 'flex-end', marginTop: -36, marginRight: space.md, backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 2 }}>
            <T size="tiny">{slide + 1}/{banners.length}</T>
          </View>

          <SectionTitle>
            복잡한 서류 준비 <Text style={{ color: c.accent }}>라잇나우</Text>에서!
          </SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {home.documents.map((d) => (
              <Pressable
                key={d.name}
                onPress={() => router.push({ pathname: '/service/[name]', params: { name: d.name } })}
                style={({ pressed }) => [card, { width: (inner - space.sm * 2) / 3, minHeight: 96, padding: space.md, justifyContent: 'space-between', opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ fontFamily: family.bold, fontSize: 16, color: c.text }}>{d.name}</Text>
                <View style={{ alignSelf: 'flex-end' }}><Icon name="case" color={c.accent} size={26} /></View>
              </Pressable>
            ))}
          </View>

          <SectionTitle>어떤 분야의 상담을 원하시나요?</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg }}>
            {fields.map((f) => (
              <Pressable key={f} onPress={() => router.push({ pathname: '/find', params: { field: f } })} style={{ width: inner / 4, alignItems: 'center', gap: space.xs }}>
                <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: family.heavy, fontSize: 18, color: c.accent }}>{f.slice(0, 1)}</Text>
                </View>
                <Text style={{ fontFamily: family.regular, fontSize: 13, color: c.text, textAlign: 'center', paddingHorizontal: 2 }}>{f}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setAllFields((v) => !v)} style={{ alignSelf: 'center', marginTop: space.md, padding: space.sm }}>
            <T size="small" color={c.sub}>{allFields ? '접기 ︿' : '더 보기 ﹀'}</T>
          </Pressable>

          <SectionTitle>의뢰인의 사건을 해결한 실제 사례</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
            {home.cases.map((x) => (
              <View key={x.title} style={[card, { width: inner * 0.8, padding: space.lg, gap: space.sm }]}>
                <View style={{ flexDirection: 'row', gap: space.xs }}>
                  {x.tags.map((t) => <Badge key={t} label={t} />)}
                  {x.sample ? <Badge label="샘플" tone="plain" /> : null}
                </View>
                <T bold>{x.title}</T>
                <Text numberOfLines={2} style={{ fontFamily: family.regular, color: c.sub, fontSize: 14, lineHeight: 20 }}>{x.summary}</Text>
              </View>
            ))}
          </ScrollView>

          <SectionTitle>전문가가 직접 답하는 신속 Q&amp;A</SectionTitle>
          <View style={[card, { padding: space.xl, alignItems: 'center', gap: space.md }]}>
            <T color={c.sub}>등록된 콘텐츠가 없습니다</T>
            <Pressable onPress={() => router.push('/recommend')} style={{ borderWidth: 1.5, borderColor: c.accent, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.sm }}>
              <Text style={{ fontFamily: family.semibold, color: c.accent, fontSize: 16 }}>상담글 작성하기</Text>
            </Pressable>
          </View>

          <SectionTitle>변호사가 설명하는 분야별 법률정보</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
            {home.articles.map((a) => (
              <View key={a.title} style={[card, { width: inner * 0.45, minHeight: 170, padding: space.lg, justifyContent: 'space-between' }]}>
                <Text numberOfLines={3} style={{ fontFamily: family.bold, fontSize: 17, lineHeight: 24, color: c.text }}>{a.title}</Text>
                <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
                  <Badge label={a.field} />
                  {a.sample ? <Badge label="샘플" tone="plain" /> : null}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ fontFamily: family.bold, fontSize: 20, color: c.text, marginTop: space.xxl, marginBottom: space.md }}>{children}</Text>;
}
