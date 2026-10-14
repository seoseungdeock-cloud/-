import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 서버 주소와 공개 키(anon/publishable)는 앱에 들어가는 값입니다. 관리자 키(service_role)는 절대 여기 두지 않습니다.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// 주소·키가 없으면 지금처럼 기기 안 목업 데이터로 동작합니다.
export const serverEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = serverEnabled
  ? createClient(url, anonKey, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

// 로그인 아이디는 Supabase 인증의 이메일 자리에 넣습니다 (실제 메일은 보내지 않음).
export const LOGIN_DOMAIN = 'rightnow.local';

export function loginEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
}

export function loginIdFromEmail(email: string | undefined): string | undefined {
  const suffix = `@${LOGIN_DOMAIN}`;
  return email?.endsWith(suffix) ? email.slice(0, -suffix.length) : undefined;
}

// 함수(rpc) 오류는 사람이 읽을 사유를 담고 있습니다.
export function reasonOf(error: { message?: string } | null | undefined, fallback = '잠시 후 다시 시도해 주세요.'): string {
  const m = error?.message ?? '';
  if (/Invalid login credentials/i.test(m)) return '아이디 또는 비밀번호가 맞지 않습니다.';
  if (/[가-힣]/.test(m)) return m;
  return fallback;
}
