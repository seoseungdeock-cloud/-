// 디자인 토큰 (마케팅전문가 방향: 흰 바탕, 큰 글씨, 강조색 하나, 광고·장식 없음)
import { useColorScheme } from 'react-native';

const light = {
  bg: '#FFFFFF',
  surface: '#F2F4F6',
  line: '#E5E8EB',
  text: '#191F28',
  sub: '#6B7684',
  faint: '#8B95A1',
  accent: '#2F6BFF',
  accentSoft: '#E8F0FF',
  secure: '#0E8A5F', // 암호화방 표시
  secureSoft: '#E3F5EC',
  ai: '#7A4DFF', // AI 참여방 표시
  aiSoft: '#F0EAFF',
  warn: '#D9480F',
  warnSoft: '#FFF0E6',
  member: '#B8860B',
  bubbleMine: '#2F6BFF',
  bubbleMineText: '#FFFFFF',
  bubbleOther: '#F2F4F6',
};

const dark: typeof light = {
  bg: '#101317',
  surface: '#1C2026',
  line: '#2A2F36',
  text: '#F2F4F6',
  sub: '#A3ACB8',
  faint: '#7F8894',
  accent: '#5B8CFF',
  accentSoft: '#1D2A45',
  secure: '#3CC48E',
  secureSoft: '#15302A',
  ai: '#A68BFF',
  aiSoft: '#2A2345',
  warn: '#FF8A4C',
  warnSoft: '#3A2418',
  member: '#E0B84A',
  bubbleMine: '#3B6FF0',
  bubbleMineText: '#FFFFFF',
  bubbleOther: '#1C2026',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const font = { title: 26, h2: 20, body: 16, small: 14, tiny: 12 };
export const MAX_WIDTH = 720;
