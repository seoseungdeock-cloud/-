// 폰 하단 탭 막대. 현재 탭 뒤에서 둥근 칸이 미끄러져 따라가고, 누른 아이콘은 톡 튀어 오릅니다. 안 읽음 배지는 숫자가 바뀔 때 통통.
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icons';
import { Bounce, Press, spring } from './motion';
import { Badge } from './shell';
import { family, radius, useColors } from './theme';

const BAR_H = 56;
const PILL_W = 52;
const PILL_H = 32;

export function TabBar({ state, descriptors, navigation, icons, badges }: BottomTabBarProps & { icons: Record<string, IconName>; badges?: Record<string, number> }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  // href: null 로 숨긴 탭(expo-router 가 tabBarItemStyle display:none 으로 바꿔 둠)은 그리지 않습니다
  const routes = state.routes.filter((r) => (descriptors[r.key].options.tabBarItemStyle as { display?: string } | undefined)?.display !== 'none');
  const slot = routes.length ? width / routes.length : 0;
  const index = routes.findIndex((r) => r.key === state.routes[state.index]?.key);
  const x = Math.max(0, index) * slot + (slot - PILL_W) / 2;
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(x, spring.snappy) }], opacity: slot ? 1 : 0 }));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', height: BAR_H + insets.bottom, paddingBottom: insets.bottom, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.lineStrong }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: (BAR_H - PILL_H) / 2 - 6, left: 0, width: PILL_W, height: PILL_H, borderRadius: radius.pill, backgroundColor: c.accentSoft }, pill]} />
      {routes.map((route) => {
        const { options } = descriptors[route.key];
        const focused = state.routes[state.index]?.key === route.key;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const n = badges?.[route.name] ?? 0;
        return (
          <TabItem
            key={route.key}
            label={label}
            icon={icons[route.name] ?? 'chat'}
            focused={focused}
            badge={n}
            onPress={() => {
              const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !ev.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
          />
        );
      })}
    </View>
  );
}

function TabItem({ label, icon, focused, badge, onPress }: { label: string; icon: IconName; focused: boolean; badge: number; onPress: () => void }) {
  const c = useColors();
  const y = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Press
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      scale={0.9}
      onPress={() => {
        // 아이콘이 톡 튀어 오르고 돌아옵니다
        y.set(withSequence(withSpring(-5, { damping: 10, stiffness: 400 }), withSpring(0, spring.bouncy)));
        onPress();
      }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6, gap: 3 }}>
      <Animated.View style={[{ height: PILL_H, width: PILL_W, alignItems: 'center', justifyContent: 'center' }, anim]}>
        <Icon name={icon} color={focused ? c.accent : c.mute} size={23} />
        {badge ? (
          <View style={{ position: 'absolute', top: -2, right: 2 }}>
            <Bounce keyOf={badge}>
              <Badge n={badge} color={c.accent} />
            </Bounce>
          </View>
        ) : null}
      </Animated.View>
      <Text style={{ fontSize: 10.5, ...family.semibold, letterSpacing: -0.1, color: focused ? c.text : c.faint }}>{label}</Text>
    </Press>
  );
}
