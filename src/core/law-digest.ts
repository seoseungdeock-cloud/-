// 법령개정·최신판례 게시판 자동 게시.
// 서버가 붙으면 매일 오전 7시(한국 시간)에 국가법령정보센터 공개 API 등에서 전날 개정 법령과 새 판례를 가져와
// 이 파일의 함수로 글을 만들고 게시판에 올립니다. 지금은 서버가 없어 예시 글만 들어 있습니다.
import type { BoardPost } from './types';

export const LAW_BOT = 'bot_law';
export const LAW_BOT_NAME = '법령·판례 알림';

export type LawUpdate = {
  kind: 'law' | 'precedent';
  /** 출처의 고유 번호 (같은 글을 두 번 올리지 않도록) */
  sourceId: string;
  title: string;
  /** 공포일·시행일 또는 선고일 (YYYY-MM-DD) */
  date: string;
  court?: string;
  caseNo?: string;
  /** 판결요지 또는 개정 이유·주요 내용 */
  gist: string;
  url?: string;
};

const GIST_MAX = 400;

/** 요지만 짧게: 첫 단락을 쓰고 너무 길면 문장 단위로 자릅니다. */
export function shortGist(gist: string, max = GIST_MAX): string {
  const first = gist.trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const end = Math.max(cut.lastIndexOf('다.'), cut.lastIndexOf('. '));
  return `${end > max / 2 ? cut.slice(0, end + 2) : cut}…`.trim();
}

export function digestTitle(u: LawUpdate): string {
  if (u.kind === 'law') return `[법령 개정] ${u.title}`;
  return `[판례] ${[u.court, u.date.replaceAll('-', '. ') + '.', u.caseNo].filter(Boolean).join(' ')} ${u.title}`.trim();
}

export function digestBody(u: LawUpdate): string {
  return [shortGist(u.gist), u.url ? `원문: ${u.url}` : ''].filter(Boolean).join('\n\n');
}

/** 이미 올린 출처는 건너뛰고 새 글만 만듭니다. */
export function digestPosts(updates: LawUpdate[], existing: BoardPost[], at: string, newId: () => string): BoardPost[] {
  const seen = new Set(existing.map((p) => p.sourceId).filter(Boolean));
  const out: BoardPost[] = [];
  for (const u of updates) {
    if (seen.has(u.sourceId) || !u.gist.trim()) continue;
    seen.add(u.sourceId);
    out.push({ id: newId(), board: 'lawnews', authorId: LAW_BOT, field: '', title: digestTitle(u), body: digestBody(u), at, votes: {}, comments: [], sourceId: u.sourceId });
  }
  return out;
}

/** 다음 자동 게시 시각: 한국 시간 오전 7시 */
export function nextDigestAt(now: Date): Date {
  const KST = 9 * 3_600_000;
  const k = new Date(now.getTime() + KST);
  const run = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), 7) - KST;
  return new Date(run > now.getTime() ? run : run + 86_400_000);
}
