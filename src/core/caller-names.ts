// 전화 올 때 의뢰인 이름 표시 (승덕 2026-10-22): 내가 들어가 있는 사건방의 의뢰인 번호를
// 이 폰의 연락처에 '의뢰인 이름 · 사건방'으로 넣어 두면, 그 번호로 전화가 올 때 폰이 그 이름을 보여 줍니다.
// 의뢰인 계정에서는 하지 않고, 방에서 나가거나 끄면 넣어 둔 연락처를 지웁니다.
import type { Room, User } from './types';

/** 앱이 넣은 연락처 표시 (회사 칸) — 이 표시가 있는 연락처만 고치거나 지웁니다 */
export const CALLER_MARK = '대륜톡 의뢰인';

export type CallerEntry = { phone: string; digits: string; name: string };

export const phoneDigits = (s: string) => s.replace(/\D/g, '').replace(/^82(?=1)/, '0');

/** 휴대폰 번호처럼 보이는지 (01로 시작 10~11자리) */
export const isMobile = (s: string) => /^01\d{8,9}$/.test(phoneDigits(s));

export function callerEntries(rooms: Room[], users: User[], meId: string): CallerEntry[] {
  const me = users.find((u) => u.id === meId);
  if (!me || me.role === 'client') return [];
  const byPhone = new Map<string, { user: User; rooms: string[] }>();
  for (const r of rooms) {
    if (r.kind !== 'case' || !r.memberIds.includes(meId)) continue;
    for (const id of r.memberIds) {
      const u = users.find((x) => x.id === id);
      if (u?.role !== 'client' || !u.phone || !isMobile(u.phone)) continue;
      const d = phoneDigits(u.phone);
      const hit = byPhone.get(d) ?? { user: u, rooms: [] };
      hit.rooms.push(r.caseInfo?.title || r.title);
      byPhone.set(d, hit);
    }
  }
  return [...byPhone.entries()]
    .map(([digits, { user, rooms: rs }]) => ({
      phone: user.phone!,
      digits,
      name: `의뢰인 ${user.nickname} · ${rs[0]}${rs.length > 1 ? ` 외 ${rs.length - 1}건` : ''}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 의뢰인 전화번호 붙여넣기 ('홍길동 010-1234-5678' 한 줄에 한 명) */
export function parsePhoneList(text: string): { items: { name: string; phone: string }[]; bad: string[] } {
  const items: { name: string; phone: string }[] = [];
  const bad: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)[\s,\t]+(\+?[\d\s-]{9,})$/);
    if (!m || !isMobile(m[2])) {
      bad.push(line);
      continue;
    }
    const d = phoneDigits(m[2]);
    items.push({ name: m[1].replace(/[,\t]+$/, '').trim(), phone: d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` });
  }
  return { items, bad };
}
