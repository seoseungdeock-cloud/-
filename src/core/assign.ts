// 배당·재배당 안내 (승덕 2026-10-22): 그룹 배당표 엑셀 → 사건방마다 '배당 안내' 카드.
// 배당표에는 사건번호가 없어 '의뢰인 이름(사건방의 의뢰인 계정) + 사건명'으로 방을 찾고, 올리기 전에 사람이 확인합니다.
// 사건방에는 의뢰인도 있으므로 사건·관할·담당 변호사만 담고 착수금·입금·전문인력·요청사항·사건개요는 담지 않습니다.
import type { Room, User } from './types';

/** 맞춰 볼 사건방 (서버에서는 어드민 전용 목록으로 받음) */
export type CaseRoomRef = { id: string; title: string; clients: string[]; /** 사건명 맞추기에 함께 보는 글 */ alt?: string };

export type AssignEntry = {
  /** 표에서 몇째 줄 (같은 의뢰인·사건이 여러 번 나와도 구분) */
  row: number;
  /** 날짜 줄 (예: '10.22 목 (1)', '9.1 재배당') */
  section: string;
  reassign: boolean;
  client: string;
  caseName: string;
  court?: string;
  /** 담당 변호사 (부장·평·추가 순) */
  lawyers: string[];
  /** 재배당에서 빠진·들어온 변호사 ('OOO 삭제', 'OOO 추가') */
  removed: string[];
  added: string[];
};

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s: string) => s.replace(/\s+/g, '');
const blank = (s: string) => !s || s === '.' || s === '-';

/** 엑셀 표(첫 시트) → 배당 줄. 제목 줄('의뢰인'·'사건명')을 찾고, 날짜 줄은 묶음 이름으로 씁니다. */
export function parseAssignSheet(table: unknown[][]): { entries: AssignEntry[]; error?: string } {
  const rows = table.map((r) => (r ?? []).map(clean));
  const head = rows.findIndex((r) => r.some((c) => key(c) === '의뢰인') && r.some((c) => key(c) === '사건명'));
  if (head < 0) return { entries: [], error: "'의뢰인'과 '사건명' 칸이 있는 배당표를 올려 주세요." };
  const at = (name: string) => rows[head].findIndex((c) => key(c) === name);
  const iClient = at('의뢰인');
  const iCase = at('사건명');
  const iCourt = at('관할');
  const iLawyer = at('담당변호사');
  // 담당변호사 칸은 부장·평변호사 두 칸 + 추가 한 칸 (제목은 첫 칸에만)
  const lawyerCols = iLawyer >= 0 ? [iLawyer, iLawyer + 1, iLawyer + 2].filter((i) => i < rows[head].length && (i === iLawyer || !rows[head][i])) : [];
  const entries: AssignEntry[] = [];
  let section = '';
  rows.slice(head + 1).forEach((r, k) => {
    const first = r[0] ?? '';
    const client = r[iClient] ?? '';
    const caseName = r[iCase] ?? '';
    if (!client || !caseName) {
      // 날짜 줄 ('10.22 목', 숫자 10.1 등) 또는 소제목 줄
      if (first && !caseName) section = first;
      return;
    }
    if (client === '의뢰인') return; // 제목 줄 반복
    const lawyers: string[] = [];
    const removed: string[] = [];
    const added: string[] = [];
    for (const i of lawyerCols) {
      const v = r[i] ?? '';
      if (blank(v)) continue;
      const m = v.match(/^(.+?)\s*(삭제|추가)$/);
      if (m) (m[2] === '삭제' ? removed : added).push(m[1].trim());
      else lawyers.push(v);
    }
    entries.push({
      row: head + 2 + k, section, reassign: /재배당/.test(section) || removed.length > 0 || added.length > 0, client, caseName,
      ...(iCourt >= 0 && !blank(r[iCourt] ?? '') ? { court: r[iCourt] } : {}),
      lawyers: [...lawyers, ...added.filter((a) => !lawyers.includes(a))], removed, added,
    });
  });
  if (!entries.length) return { entries, error: '배당 줄을 찾지 못했습니다.' };
  return { entries };
}

export type AssignMatch = { entry: AssignEntry; candidates: CaseRoomRef[]; roomId?: string };

/** 기기 안 상태의 사건방 → 맞춰 볼 목록 */
export function caseRoomRefs(rooms: Room[], users: User[]): CaseRoomRef[] {
  return rooms
    .filter((r) => r.kind === 'case')
    .map((r) => ({ id: r.id, title: r.title, ...(r.caseInfo?.title ? { alt: r.caseInfo.title } : {}), clients: r.memberIds.map((id) => users.find((u) => u.id === id)).filter((u) => u?.role === 'client').map((u) => u!.nickname) }));
}

/** 의뢰인 이름이 같은 사건방을 찾고, 여러 개면 방 이름에 사건명이 들어간 방을 고릅니다. 못 고르면 사람이 고릅니다. */
export function matchAssignments(entries: AssignEntry[], rooms: CaseRoomRef[]): AssignMatch[] {
  return entries.map((entry) => {
    const name = key(entry.client);
    const candidates = rooms.filter((r) => r.clients.some((c) => key(c) === name));
    const byCase = candidates.filter((r) => key(`${r.title}${r.alt ?? ''}`).includes(key(entry.caseName)));
    const pick = candidates.length === 1 ? candidates[0] : byCase.length === 1 ? byCase[0] : undefined;
    return { entry, candidates, ...(pick ? { roomId: pick.id } : {}) };
  });
}

export const ASSIGN_HEAD = '[배당 안내]';
export const REASSIGN_HEAD = '[재배당 안내]';

/** 방에 올라가는 글 (푸시·목록 미리보기에도 이 글이 보입니다). 카드는 이 글을 읽어 그립니다. */
export function assignText(e: AssignEntry): string {
  const L = [`${e.reassign ? REASSIGN_HEAD : ASSIGN_HEAD} ${e.caseName}`];
  if (e.court) L.push(`관할: ${e.court}`);
  if (e.lawyers.length) L.push(`담당 변호사: ${e.lawyers.join(', ')}`);
  if (e.removed.length || e.added.length) L.push(`변경: ${[...e.removed.map((x) => `${x} 제외`), ...e.added.map((x) => `${x} 추가`)].join(', ')}`);
  return L.join('\n');
}

export type AssignNotice = { reassign: boolean; caseName: string; fields: { label: string; value: string }[] };

/** 방의 봇 메시지가 배당 안내면 카드 내용으로 */
export function parseAssignText(text: string): AssignNotice | null {
  const [first, ...rest] = text.split('\n');
  const reassign = first.startsWith(REASSIGN_HEAD);
  if (!reassign && !first.startsWith(ASSIGN_HEAD)) return null;
  const caseName = first.slice((reassign ? REASSIGN_HEAD : ASSIGN_HEAD).length).trim();
  const fields = rest.map((l) => l.match(/^([^:]+):\s*(.*)$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => ({ label: m[1].trim(), value: m[2].trim() }));
  return { reassign, caseName, fields };
}
