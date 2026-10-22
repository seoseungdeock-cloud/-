// 로그인 화면의 '아이디 저장'·'자동 로그인' (이 기기에만 기억)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ID_KEY = 'daeryuntalk.loginId';
const AUTO_KEY = 'daeryuntalk.autoLogin';
// 웹: 이 탭(창)이 열려 있는 동안만 남는 표시. 창을 닫으면 사라집니다.
const OPEN_KEY = 'daeryuntalk.open';

const web = Platform.OS === 'web';
const local = (): Storage | undefined => {
  try {
    return web ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
};

/** 웹은 바로, 폰은 저장소에서 */
export function savedLoginIdNow(): string {
  return local()?.getItem(ID_KEY) ?? '';
}
export async function savedLoginId(): Promise<string> {
  return web ? savedLoginIdNow() : ((await AsyncStorage.getItem(ID_KEY).catch(() => null)) ?? '');
}

export async function autoLoginOn(): Promise<boolean> {
  const v = web ? local()?.getItem(AUTO_KEY) : await AsyncStorage.getItem(AUTO_KEY).catch(() => null);
  return v !== '0';
}
export function autoLoginNow(): boolean {
  return local()?.getItem(AUTO_KEY) !== '0';
}

/** 로그인 성공 뒤: 고른 대로 저장 */
export async function saveLoginPrefs(loginId: string | null, auto: boolean) {
  try {
    if (loginId) await AsyncStorage.setItem(ID_KEY, loginId);
    else await AsyncStorage.removeItem(ID_KEY);
    await AsyncStorage.setItem(AUTO_KEY, auto ? '1' : '0');
    if (web) globalThis.sessionStorage?.setItem(OPEN_KEY, '1');
  } catch {
    // 저장이 막혀도 로그인은 됩니다
  }
}

/**
 * 앱을 새로 열 때: 자동 로그인을 끈 기기면 저장된 로그인을 이어 쓰지 않습니다.
 * 웹은 같은 창에서 새로 고침한 경우만 이어 쓰고, 창을 닫았다 열면 다시 로그인합니다.
 */
export async function keepSession(): Promise<boolean> {
  if (await autoLoginOn()) return true;
  try {
    return web && globalThis.sessionStorage?.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
