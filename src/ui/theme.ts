// 디자인 토큰 v2 — 토스·애플 HIG 참고. 원칙 셋:
//   1) 색은 회색 단계로 구조를 만들고, 파랑(accent)은 누를 수 있는 것(버튼·배지·안 읽음)에만 쓴다. 장식에는 쓰지 않는다.
//   2) 깊이는 그림자가 아니라 면 색의 차이(흰 면 위 회색 칸, 회색 바닥 위 흰 판)로 낸다. 그림자는 떠 있는 것(시트·메뉴)에만.
//   3) 위계는 글자 크기·굵기·여백으로. 구분선 대신 간격.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform, useColorScheme } from 'react-native';
const light = {
  /** 본문 면 (흰색) */
  bg: '#FFFFFF',
  /** 바닥 — PC 창 전체·사이드바가 깔리는 연한 회색. 흰 본문 판이 이 위에 올라감 */
  page: '#F2F4F6',
  /** 바닥 위에 올리는 흰 판 */
  card: '#FFFFFF',
  /** 흰 면 위의 회색 칸 (카드·입력칸·칩) */
  surface: '#F2F4F6',
  /** 마우스 올렸을 때 */
  hover: '#F7F8FA',
  /** 아주 연한 선 */
  line: '#EEF0F3',
  /** 또렷한 선 (판 테두리·구분) */
  lineStrong: '#E5E8EB',
  text: '#191F28',
  /** 본문 보조 글자 */
  sub: '#6B7684',
  /** 설명·시각 등 흐린 글자 */
  faint: '#8B95A1',
  /** 자리 표시 글자·꺼진 아이콘 */
  mute: '#B0B8C1',
  /** 스카이넷 파랑 — 누를 수 있는 것에만 */
  accent: '#2E5BFF',
  accentStrong: '#2149D6',
  accentSoft: '#EAF0FF',
  secure: '#0E8A5F',
  secureSoft: '#E3F5EC',
  ai: '#6E4CF5',
  aiSoft: '#EFEBFF',
  warn: '#E8590C',
  warnSoft: '#FFF1E6',
  member: '#B8860B',
  bubbleMine: '#2E5BFF',
  bubbleMineText: '#FFFFFF',
  bubbleOther: '#F2F4F6',
  mark: '#FFE45C',
  markText: '#191F28',
  /** 왼쪽 메뉴·폰 상단 띠 — 진한 남색 바닥 (슬랙식 업무용 메뉴) */
  navBg: '#161B33',
  /** 메뉴 바닥보다 한 단 더 짙은 면 (메뉴 아래 내 정보 칸) */
  navDeep: '#10142A',
  /** 메뉴 글자 (켜짐) */
  navText: '#FFFFFF',
  /** 메뉴 글자 (꺼짐) */
  navMute: 'rgba(255,255,255,0.62)',
  /** 메뉴 선 */
  navLine: 'rgba(255,255,255,0.10)',
  /** 메뉴 마우스 올림 */
  navHover: 'rgba(255,255,255,0.08)',
  /** 메뉴 현재 항목 */
  navActive: 'rgba(255,255,255,0.16)',
  /** 메뉴 위 강조 (안 읽음 배지·새 대화 버튼) */
  navAccent: '#4D7CFF',
};
const darkColors: typeof light = {
  bg: '#16171B',
  page: '#0E0F12',
  card: '#1C1D22',
  surface: '#24262C',
  hover: '#1F2026',
  line: '#24262C',
  lineStrong: '#30333B',
  text: '#F2F4F6',
  sub: '#A5ADB8',
  faint: '#7B8390',
  mute: '#5A6270',
  accent: '#6B8CFF',
  accentStrong: '#5577F0',
  accentSoft: '#1F2746',
  secure: '#3CC48E',
  secureSoft: '#16302A',
  ai: '#A990FF',
  aiSoft: '#2B2548',
  warn: '#FF8A4C',
  warnSoft: '#3A2418',
  member: '#E0B84A',
  bubbleMine: '#3A62E8',
  bubbleMineText: '#FFFFFF',
  bubbleOther: '#24262C',
  mark: '#FFE45C',
  markText: '#191F28',
  navBg: '#0C0F1D',
  navDeep: '#080A15',
  navText: '#FFFFFF',
  navMute: 'rgba(255,255,255,0.58)',
  navLine: 'rgba(255,255,255,0.08)',
  navHover: 'rgba(255,255,255,0.07)',
  navActive: 'rgba(255,255,255,0.14)',
  navAccent: '#6B8CFF',
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
  return useScheme() === 'dark' ? darkColors : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** 둥글기: sm=배지·작은 버튼, md=입력칸·버튼·줄, lg=카드, xl=판·시트 */
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
/** 글씨 크기. title=화면 제목(800), h2=큰 섹션(700), h3=카드·목록 제목(600), body=본문, small=보조, tiny=시각·설명 */
export const font = { title: 28, h2: 22, h3: 17, body: 15, small: 13, tiny: 12 };
/** 제목용 자간 (크기가 클수록 더 좁힘) */
export const tracking = { title: -0.9, h2: -0.6, h3: -0.3, body: -0.1 };
export const MAX_WIDTH = 720;

/** 글씨체: 웹·PC는 Pretendard (무료 글꼴, 토스·SKYZAI 등에서 쓰는 깔끔한 고딕). 폰 앱은 기기 기본 고딕. */
const SYSTEM_WEB = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('app-font')) {
  const link = document.createElement('link');
  link.id = 'app-font';
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
  document.head.appendChild(link);
  // PC에서 화면 옆 스크롤 막대를 숨김 (휠·터치 스크롤은 그대로)
  const style = document.createElement('style');
  // 브라우저 자동 완성(저장된 비밀번호)이 칸을 연파랑으로 칠하지 않도록: 칸 색·글자색을 그대로
  style.textContent =
    '*{scrollbar-width:none;-ms-overflow-style:none}*::-webkit-scrollbar{display:none;width:0;height:0}' +
    // 글자를 또렷하게, 누르는 요소는 색·투명도가 부드럽게 바뀌도록
    'body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}[role=button],[role=link],[role=tab]{transition:background-color .15s ease,opacity .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease}' +
    `input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{-webkit-text-fill-color:${light.text};caret-color:${light.text};transition:background-color 99999s ease-out 0s}` +
    `html[data-scheme=dark] input:-webkit-autofill{-webkit-text-fill-color:${darkColors.text};caret-color:${darkColors.text}}`;
  document.head.appendChild(style);
}
const face = (fontWeight: '400' | '500' | '600' | '700' | '800') => (Platform.OS === 'web' ? { fontFamily: SYSTEM_WEB, fontWeight } : { fontWeight });

/** 글씨 굵기. 스타일 안에 펼쳐 씁니다: { ...family.bold } */
export const family = {
  regular: face('400'),
  semibold: face('600'),
  bold: face('700'),
  heavy: face('800'),
};

type Shadow = { shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number }; elevation?: number; boxShadow?: string };
function makeShadow(y: number, blur: number, opacity: number, elevation: number): Shadow {
  if (Platform.OS === 'web') return { boxShadow: `0 ${y}px ${blur}px rgba(15, 23, 42, ${opacity})` };
  return { shadowColor: '#0F172A', shadowOpacity: opacity * 1.6, shadowRadius: blur / 2, shadowOffset: { width: 0, height: y }, elevation };
}
/**
 * 그림자 3단계 (웹·폰 공통). 라이트 모드 전용 — 다크 모드에서는 보이지 않으므로 useElevation() 으로 테두리를 대신 씁니다.
 *   soft: 카드·목록 칸    pop: 떠 있는 버튼·시트    float: 모달·드롭다운
 */
export const shadow = {
  soft: makeShadow(1, 3, 0.06, 1),
  pop: makeShadow(4, 12, 0.12, 4),
  float: makeShadow(8, 24, 0.16, 8),
};
const NO_SHADOW: Shadow = Platform.OS === 'web' ? { boxShadow: 'none' } : {};
/**
 * 바닥(page) 위에 올리는 판 스타일: 흰(또는 다크의 밝은) 면 + 1px 선. 그림자는 level 을 줄 때만 (떠 있는 메뉴·시트).
 */
export function useElevation(level?: 'soft' | 'pop' | 'float'): Shadow & { backgroundColor: string; borderWidth: number; borderColor: string } {
  const dark = useScheme() === 'dark';
  const c = dark ? darkColors : light;
  return { backgroundColor: c.card, borderWidth: 1, borderColor: c.lineStrong, ...(level && !dark ? shadow[level] : NO_SHADOW) };
}
/** SVG 글자용 */
export const SVG_FONT = Platform.OS === 'web' ? SYSTEM_WEB : undefined;
