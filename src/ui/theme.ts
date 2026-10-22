// 디자인 토큰 (흰 바탕, 대륜 붉은색 강조, 기기 기본 글씨체, 광고·장식 없음)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform, useColorScheme } from 'react-native';

const light = {
  bg: '#FFFFFF',
  surface: '#F2F4F6',
  line: '#E5E8EB',
  text: '#191F28',
  sub: '#6B7684',
  faint: '#8B95A1',
  accent: '#A82235', // 대륜 로고 붉은색
  accentSoft: '#FCEBED',
  secure: '#0E8A5F', // 사건수행방 표시
  secureSoft: '#E3F5EC',
  ai: '#7A4DFF', // AI 참여방 표시
  aiSoft: '#F0EAFF',
  warn: '#D9480F',
  warnSoft: '#FFF0E6',
  member: '#B8860B',
  bubbleMine: '#A82235',
  bubbleMineText: '#FFFFFF',
  bubbleOther: '#F2F4F6',
  mark: '#FFE45C', // 검색 형광펜
  markText: '#191F28',
};

const dark: typeof light = {
  bg: '#101317',
  surface: '#1C2026',
  line: '#2A2F36',
  text: '#F2F4F6',
  sub: '#A3ACB8',
  faint: '#7F8894',
  accent: '#F0505F',
  accentSoft: '#3A1C20',
  secure: '#3CC48E',
  secureSoft: '#15302A',
  ai: '#A68BFF',
  aiSoft: '#2A2345',
  warn: '#FF8A4C',
  warnSoft: '#3A2418',
  member: '#E0B84A',
  bubbleMine: '#B81428',
  bubbleMineText: '#FFFFFF',
  bubbleOther: '#1C2026',
  mark: '#FFE45C',
  markText: '#191F28',
};

export type Colors = typeof light;

/** 화면 모드: 기기 설정 따라가기 / 라이트 / 다크 (이 기기에 기억) */
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: '자동' },
  { key: 'light', label: '라이트' },
  { key: 'dark', label: '다크' },
];
const MODE_KEY = 'daeryuntalk.themeMode';
const modeListeners = new Set<() => void>();
const asMode = (v: string | null | undefined): ThemeMode => (v === 'light' || v === 'dark' ? v : 'system');
let mode: ThemeMode = 'system';
try {
  // 웹은 바로 읽어서 첫 화면부터 맞는 색으로
  if (Platform.OS === 'web') mode = asMode(globalThis.localStorage?.getItem(MODE_KEY));
  else void AsyncStorage.getItem(MODE_KEY).then((v) => setThemeMode(asMode(v), false)).catch(() => undefined);
} catch {
  // 저장이 막힌 브라우저: 기기 설정 따라감
}

export function setThemeMode(next: ThemeMode, save = true) {
  mode = next;
  if (save) void AsyncStorage.setItem(MODE_KEY, next).catch(() => undefined);
  modeListeners.forEach((fn) => fn());
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (fn) => {
      modeListeners.add(fn);
      return () => modeListeners.delete(fn);
    },
    () => mode,
    () => mode,
  );
}

/** 실제로 쓰는 밝기 (고른 모드, 자동이면 기기 설정) */
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const m = useThemeMode();
  return m === 'system' ? (system === 'dark' ? 'dark' : 'light') : m;
}

/** 웹: 문서에 지금 밝기를 적어 둡니다 (자동 완성 글자색 맞춤용) */
export function markScheme(scheme: 'light' | 'dark') {
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.dataset.scheme = scheme;
}

export function useColors(): Colors {
  return useScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const font = { title: 26, h2: 20, body: 16, small: 14, tiny: 12 };
export const MAX_WIDTH = 720;

/** 글씨체: 웹·PC는 Noto Sans KR (구글 무료 글꼴, 메신저·포털에서 많이 쓰는 깔끔한 고딕). 폰 앱은 기기 기본 고딕. */
const SYSTEM_WEB = '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('app-font')) {
  const link = document.createElement('link');
  link.id = 'app-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap';
  document.head.appendChild(link);
  // PC에서 화면 옆 스크롤 막대를 숨김 (휠·터치 스크롤은 그대로)
  const style = document.createElement('style');
  // 브라우저 자동 완성(저장된 비밀번호)이 칸을 연파랑으로 칠하지 않도록: 칸 색·글자색을 그대로
  style.textContent =
    '*{scrollbar-width:none;-ms-overflow-style:none}*::-webkit-scrollbar{display:none;width:0;height:0}' +
    `input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{-webkit-text-fill-color:${light.text};caret-color:${light.text};transition:background-color 99999s ease-out 0s}` +
    `html[data-scheme=dark] input:-webkit-autofill{-webkit-text-fill-color:${dark.text};caret-color:${dark.text}}`;
  document.head.appendChild(style);
}
const face = (fontWeight: '400' | '500' | '600' | '700') => (Platform.OS === 'web' ? { fontFamily: SYSTEM_WEB, fontWeight } : { fontWeight });

/** 글씨 굵기. 스타일 안에 펼쳐 씁니다: { ...family.bold } */
export const family = {
  regular: face('400'),
  semibold: face('500'),
  bold: face('700'),
  heavy: face('700'),
};
/** SVG 글자용 */
export const SVG_FONT = Platform.OS === 'web' ? SYSTEM_WEB : undefined;
