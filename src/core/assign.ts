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
  /** 부장변호사 (담당변호사 첫 칸) */
  chief: string;
  /** 평변호사 (둘째·셋째 칸, 빠진 사람 제외) */
  associates: string[];
  /** 전문인력 칸 */
  staff?: string;
  /** 재배당에서 빠진·들어온 변호사 ('OOO 삭제', 'OOO 추가') */
  removed: string[];
  added: string[];
  /** 바뀐 자리 (부장 칸이 바뀌었으면 'chief') */
  changed?: 'chief' | 'associate';
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
  const iStaff = at('전문인력');
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
    let chief = '';
    const associates: string[] = [];
    let changed: AssignEntry['changed'];
    lawyerCols.forEach((i, n) => {
      const v = r[i] ?? '';
      if (blank(v)) return;
      const m = v.match(/^(.+?)\s*(삭제|추가)$/);
      const name = m ? m[1].trim() : v;
      if (m) {
        (m[2] === '삭제' ? removed : added).push(name);
        changed = changed === 'chief' || n === 0 ? 'chief' : 'associate';
        if (m[2] === '삭제') return;
      } else lawyers.push(v);
      if (n === 0) chief = name;
      else if (!associates.includes(name)) associates.push(name);
    });
    const staff = iStaff >= 0 && !blank(r[iStaff] ?? '') ? r[iStaff] : '';
    entries.push({
      row: head + 2 + k, section, reassign: /재배당/.test(section) || removed.length > 0 || added.length > 0, client, caseName,
      ...(iCourt >= 0 && !blank(r[iCourt] ?? '') ? { court: r[iCourt] } : {}),
      lawyers: [...lawyers, ...added.filter((a) => !lawyers.includes(a))], chief, associates, ...(staff ? { staff } : {}), removed, added,
      ...(changed ? { changed } : {}),
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

// ── 안내 글 (승덕님 양식 2026-10-22) ──
// 사건방에는 의뢰인도 있지만 이 안내는 변호사·직원에게만 보입니다(서버에서 의뢰인에게는 내려가지 않음).

export const ASSIGN_HEAD = '[배당 안내]';
const HEAD_RE = /^\[(?:(\d{1,2}월 \d{1,2}일) )?(재)?배당 안내\]$/;

/** 백오피스에서 올리기 전에 고칠 수 있는 칸 (빈 칸도 양식대로 남김) */
export type AssignDraft = { reassign: boolean; date?: string; fields: { label: string; value: string }[] };

export const ASSIGN_LABELS = ['부장변호사 겸 주수행 변호사', '평변호사', '재판변호사', '총괄변호사', '상담 변호사', '상담실장'] as const;
export const REASSIGN_LABELS = ['재배당 포지션', '재배당 사유', '부장변호사', '평변호사', '전문인력/실장'] as const;

const ASSIGN_BODY = [
  '주수행 변호사(부장변호사)는 사건처리의 모든 책임과 권한을 가집니다. 주수행 변호사(부장변호사)는 사건을 직접 수행하거나 수행변호사에게 업무를 위임하여 진행할 수 있습니다.',
  '주수행 변호사님께서는 의뢰인께 배당인사 진행 부탁드리며, 담당 사무원님께서는 체크리스트 작성하시어 업로드 부탁드립니다.',
];
const REASSIGN_BODY = [
  '1. 재배당 인수인계 관련 안내\n재배당 전 담당변호사님께서는 즉시 퇴장하지 마시고, 재배당 받은 변호사님께 사건 관련 주의사항 및 특이사항 등을 충분히 안내하신 후, 인계가 완료된 시점에 퇴장하여 주시기 바랍니다.',
  '2. 의뢰인 안내 및 소통\n재배당 받은 부장변호사님께서는 의뢰인에게 담당변호사 변경 사실을 직접 안내하여 주시기 바라며, 부장변호사님 담당 법률사무원께서는 의뢰인에게 부장변호사님의 직통 연락처(휴대폰 번호)를 안내하여 주시기 바랍니다.',
  '3. 재배당 체크리스트 등록 (필수)\n재배당 받은 부장변호사님께서는 재배당일 기준 3영업일 이내, 대륜탑 해당 사건의 사건진행종합에 ‘재배당 체크리스트’를 반드시 등록하여 주시기 바랍니다.\n(경로: 대륜탑 → 사건 → 사건진행종합)',
  '※ 본 사항은 본사 필수 지침으로, 미이행 시 관리 대상이 될 수 있으니 반드시 기한 내 등록 부탁드립니다.',
  '감사합니다.',
];

/** 이름 뒤에 '변호사'를 붙임 (이미 붙어 있거나 X·빈 칸이면 그대로) */
export const lawyerName = (s: string) => (!s || s === 'X' || /변호사/.test(s) ? s : `${s} 변호사`);

/** 날짜 줄 '9.1 재배당' → '9월 1일' (없으면 오늘) */
export function assignDate(section: string, now = new Date()): string {
  const m = section.match(/(\d{1,2})\s*[./]\s*(\d{1,2})/);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : `${now.getMonth() + 1}월 ${now.getDate()}일`;
}

/** 배당표 한 줄 → 양식 칸 (배당표에 없는 칸은 비워 둠) */
export function assignDraft(e: AssignEntry, now = new Date()): AssignDraft {
  const assoc = e.associates.join(', ');
  if (!e.reassign) {
    const v = [e.chief, assoc, '', '', '', ''];
    return { reassign: false, fields: ASSIGN_LABELS.map((label, i) => ({ label, value: v[i] })) };
  }
  const pos = e.changed === 'chief' ? '부장 변호사' : '평 변호사';
  const op = e.added.length && e.removed.length ? '변경' : e.added.length ? '추가' : e.removed.length ? '제외' : '변경';
  const v = [pos, `${pos} ${op}`, lawyerName(e.chief), e.associates.map(lawyerName).join(', '), e.staff ?? 'X'];
  return { reassign: true, date: assignDate(e.section, now), fields: REASSIGN_LABELS.map((label, i) => ({ label, value: v[i] })) };
}

/** 방에 올라가는 전체 글 (자세히 보기·푸시·검색에 쓰임). 말풍선은 이 글을 읽어 간략히 그립니다. */
export function assignText(d: AssignDraft): string {
  const val = (l: string) => d.fields.find((f) => f.label === l)?.value.trim() ?? '';
  if (!d.reassign) {
    const L = ['[배당 안내]', ''];
    for (const l of ASSIGN_LABELS.slice(0, 4)) L.push(`* ${l} : ${val(l)}`);
    if (val('상담 변호사') || val('상담실장')) L.push('', `(상담 변호사 : ${val('상담 변호사')} 상담실장 : ${val('상담실장')})`);
    return [...L, '', ASSIGN_BODY.join('\n\n')].join('\n');
  }
  const L = [`[${d.date ? `${d.date} ` : ''}재배당 안내]`, ''];
  for (const l of REASSIGN_LABELS) L.push(`- ${l} : ${val(l)}`);
  return [...L, '', REASSIGN_BODY.join('\n\n')].join('\n');
}

export type AssignNotice = {
  reassign: boolean;
  /** 말풍선 둘째 줄 ('[배당 안내]', '[6월 18일 재배당 안내]') */
  head: string;
  chief: string;
  associate: string;
  fields: { label: string; value: string }[];
  full: string;
};

/** 방의 봇 메시지가 배당 안내면 말풍선 내용으로 */
export function parseAssignText(text: string): AssignNotice | null {
  const lines = text.split('\n');
  const m = lines[0].trim().match(HEAD_RE);
  if (!m) return null;
  const fields = lines
    .map((l) => l.match(/^[*-]\s*(.+?)\s*:\s*(.*)$/))
    .filter((x): x is RegExpMatchArray => !!x)
    .map((x) => ({ label: x[1].trim(), value: x[2].trim() }));
  const find = (re: RegExp) => fields.find((f) => re.test(f.label.replace(/\s/g, '')))?.value ?? '';
  return { reassign: !!m[2], head: lines[0].trim(), chief: find(/^부장변호사/), associate: find(/^평변호사$/), fields, full: text };
}

