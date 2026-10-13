// 디자인 토큰 (흰 바탕, 대륜 붉은색 강조, Pretendard 글씨체, 광고·장식 없음)
import { useColorScheme } from 'react-native';

const light = {
  bg: '#FFFFFF',
  surface: '#F2F4F6',
  line: '#E5E8EB',
  text: '#191F28',
  sub: '#6B7684',
  faint: '#8B95A1',
  accent: '#C8102E', // 대륜 붉은색 (정확한 브랜드 코드를 받으면 여기만 바꿉니다)
  accentSoft: '#FCEBED',
  secure: '#0E8A5F', // 사건수행방 표시
  secureSoft: '#E3F5EC',
  ai: '#7A4DFF', // AI 참여방 표시
  aiSoft: '#F0EAFF',
  warn: '#D9480F',
  warnSoft: '#FFF0E6',
  member: '#B8860B',
  bubbleMine: '#C8102E',
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

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const font = { title: 26, h2: 20, body: 16, small: 14, tiny: 12 };
export const MAX_WIDTH = 720;

/** 글씨체: 카카오톡·라인 같은 메신저처럼 깔끔한 고딕 계열인 Pretendard (OFL 무료 폰트) */
export const FONT_FILES = {
  'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.otf'),
  'Pretendard-ExtraBold': require('../../assets/fonts/Pretendard-ExtraBold.otf'),
};

export const family = {
  regular: 'Pretendard-Regular',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  heavy: 'Pretendard-ExtraBold',
};
