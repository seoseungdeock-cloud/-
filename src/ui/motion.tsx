// 움직임 부품 (react-native-reanimated). 화면 전체가 같은 리듬으로 움직이도록 여기 것만 씁니다.
//   Appear   : 목록 줄·카드가 아래에서 살짝 떠오르며 나타남 (index 를 주면 차례로)
//   Press    : 누르면 살짝 눌리고(0.96) 떼면 튕겨 돌아오는 버튼 바닥
//   Pop      : 배지·점처럼 작은 것이 톡 튀어나오며 나타남
//   Slide    : 칩·탭 뒤에서 미끄러지는 표시 막대 (x·width 를 주면 스프링으로 따라감)
//   spring   : 공통 스프링 값 (snappy = 빠르고 탄탄, gentle = 부드러움)
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming, ZoomIn, ZoomOut } from 'react-native-reanimated';

export const spring = {
  snappy: { damping: 18, stiffness: 260, mass: 0.7 },
  gentle: { damping: 22, stiffness: 160, mass: 0.9 },
  bouncy: { damping: 12, stiffness: 240, mass: 0.8 },
} as const;

/** 목록이 바뀔 때(정렬·삭제) 줄이 미끄러져 자리를 찾는 레이아웃 전환 */
export const listLayout = LinearTransition.springify().damping(20).stiffness(220);

const ease = Easing.out(Easing.cubic);
/** 차례로 나타나는 간격(ms)·최대 개수. 20개 넘는 긴 목록은 모두 같은 시점에 나타납니다. */
const STAGGER = 32;
const STAGGER_MAX = 14;

export function Appear({ children, index = 0, style, delay = 0, layout = true }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle>; delay?: number; layout?: boolean }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(340).easing(ease).delay(delay + Math.min(index, STAGGER_MAX) * STAGGER)}
      exiting={FadeOut.duration(140)}
      layout={layout ? listLayout : undefined}
      style={style}>
      {children}
    </Animated.View>
  );
}

/** 자리 이동 없이 서서히 나타남 (화면 바뀜·본문 교체용) */
export function Fade({ children, style, delay = 0, duration = 240 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number; duration?: number }) {
  return (
    <Animated.View entering={FadeIn.duration(duration).delay(delay)} exiting={FadeOut.duration(120)} style={style}>
      {children}
    </Animated.View>
  );
}

/** 작은 배지·점이 톡 튀어나오는 등장 */
export function Pop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(14).stiffness(260)} exiting={ZoomOut.duration(120)} style={style}>
      {children}
    </Animated.View>
  );
}

type PressStyle = ViewStyle | ((st: { pressed: boolean; hovered: boolean }) => ViewStyle);

/**
 * 누르면 눌리는 Pressable. style 은 객체 또는 (pressed·hovered) => 객체.
 * scale: 눌렸을 때 크기 (기본 0.96). lift: 마우스를 올리면 살짝 커짐 (PC 카드용)
 */
export function Press({ children, style, scale = 0.96, lift, onPressIn, onPressOut, onHoverIn, onHoverOut, ...rest }: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: PressStyle; scale?: number; lift?: boolean }) {
  const k = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  // Animated 로 감싼 Pressable 은 함수형 style 을 받지 못하므로 눌림·올림 상태를 직접 들고 객체로 넘깁니다
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const resolved = typeof style === 'function' ? style({ pressed, hovered }) : style;
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        k.set(withSpring(scale, spring.snappy));
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        k.set(withSpring(1, spring.bouncy));
        setPressed(false);
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        if (lift) k.set(withSpring(1.015, spring.gentle));
        setHovered(true);
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        if (lift) k.set(withSpring(1, spring.gentle));
        setHovered(false);
        onHoverOut?.(e);
      }}
      style={[anim, resolved]}>
      {children}
    </AnimatedPressable>
  );
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 칩·탭 뒤에서 미끄러지는 막대. 부모는 position: relative 여야 하고, x·width 는 측정값(onLayout)으로 줍니다. */
export function Slide({ x, width, height, color, radius = 999, style }: { x: number; width: number; height?: number; color: string; radius?: number; style?: StyleProp<ViewStyle> }) {
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(x, spring.snappy) }],
    width: withSpring(width, spring.snappy),
    opacity: withTiming(width > 0 ? 1 : 0, { duration: 120 }),
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, ...(height ? { height } : { bottom: 0 }), borderRadius: radius, backgroundColor: color }, style, anim]} />;
}

/** 안 읽음 수가 바뀔 때 숫자 배지가 통통 튀도록 — 값이 바뀌면 다시 Pop */
export function Bounce({ children, keyOf }: { children: ReactNode; keyOf: string | number }) {
  return <Pop key={String(keyOf)}>{children}</Pop>;
}

/** 세로로 미끄러지는 메뉴 현재 표시 (왼쪽 메뉴·탭 막대) */
export function useSlideY(y: number) {
  return useAnimatedStyle(() => ({ transform: [{ translateY: withSpring(y, spring.snappy) }] }));
}

export const isWeb = Platform.OS === 'web';
export { Animated };
