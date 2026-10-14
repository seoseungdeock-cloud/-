// 대륜탑 인증코드를 메신저의 '대륜탑 인증' 봇으로 받습니다.
// 서버가 붙으면 대륜탑이 우리 서버에 코드를 보내고(웹훅), 서버가 본인 계정에만 전달합니다.
// 코드는 일반 대화방과 분리해 전달·검색·AI 읽기를 막고, 짧게 만료됩니다.
import type { User } from './types';

export type AuthCode = { id: string; userId: string; code: string; at: string; expiresAt: string; read?: boolean };

export const AUTH_BOT_NAME = '대륜탑 인증';
export const AUTH_TTL_MIN = 3;
/** 하루가 지난 코드는 목록에서 지웁니다. */
const KEEP_MS = 86_400_000;

export function canReceiveAuthCodes(u: User): boolean {
  return u.role !== 'client';
}

export function checkAuthCode(code: string): string | undefined {
  return /^\d{4,8}$/.test(code) ? undefined : '인증코드는 숫자 4~8자리입니다.';
}

/** 남은 초 (만료되면 0) */
export function secondsLeft(c: AuthCode, now: number): number {
  return Math.max(0, Math.floor((Date.parse(c.expiresAt) - now) / 1000));
}

export function myCodes(all: AuthCode[], userId: string, now: number): AuthCode[] {
  return all.filter((c) => c.userId === userId && now - Date.parse(c.at) < KEEP_MS).sort((a, b) => a.at.localeCompare(b.at));
}

export function unreadCodes(all: AuthCode[], userId: string): number {
  return all.filter((c) => c.userId === userId && !c.read).length;
}
