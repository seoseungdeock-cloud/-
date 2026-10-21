// 사건 알림 봇: 사건수행방에서도 진행 단계·기일·배당 정보를 전해 드립니다.
// 대화 내용은 쓰지 않고 사건 기록(caseInfo)과 배당 정보만 씁니다.
import { findLawyer } from './offices';
import type { Room, User } from './types';

function day(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '.');
}

export function assignmentText(room: Room, users: User[]): string {
  const l = room.lawyerId ? findLawyer(room.lawyerId) : undefined;
  const lawyerName = l?.name ?? users.find((u) => u.role === 'lawyer' && room.memberIds.includes(u.id))?.nickname;
  const lines = ['배당 정보'];
  lines.push(`· 담당 변호사: ${lawyerName ?? '배정 대기'}`);
  if (l) lines.push(`· 사무소: ${l.office.name} (${l.office.phone})`);
  if (room.caseInfo?.field) lines.push(`· 분야: ${room.caseInfo.field}`);
  lines.push(`· 접수일: ${day(room.createdAt)}`);
  return lines.join('\n');
}

export function caseStatusText(room: Room, users: User[], today = new Date().toISOString().slice(0, 10)): string {
  const c = room.caseInfo;
  if (!c) return ['진행 현황', '· 단계: 상담 (수임 전)', '', assignmentText(room, users)].join('\n');
  const last = c.progress.at(-1);
  const next = [...c.deadlines].filter((d) => d.date >= today && !d.firmOnly).sort((a, b) => a.date.localeCompare(b.date))[0];
  const lines = ['진행 현황', `· 단계: ${c.stage}`];
  if (last) lines.push(`· 최근 진행: ${last.note} (${day(last.at)})`);
  lines.push(`· 다음 기일: ${next ? `${next.label} (${next.date})` : '없음'}`);
  return [...lines, '', assignmentText(room, users)].join('\n');
}

/** '@AI 진행 상황', '@AI 배당' 같은 사건 정보 요청 */
export function asksCaseInfo(text: string): 'status' | 'assignment' | undefined {
  if (/배당|담당|배정/.test(text)) return 'assignment';
  if (/진행|상황|단계|기일|현황/.test(text)) return 'status';
  return undefined;
}
