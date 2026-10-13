import type { BoardComment, BoardKind, BoardPost, BoardReport, NoteThread, Role, User, Votes } from './types';

const ROLE_LABEL: Record<Role, string> = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' };

/** 글 안에서의 익명 번호. 글쓴이가 익명 1, 댓글 단 사람은 처음 등장한 순서대로 2, 3… (의뢰인·변호사 구분 없음) */
export function aliasIn(post: BoardPost, userId: string): string {
  const order = [post.authorId];
  for (const c of post.comments) if (!order.includes(c.authorId)) order.push(c.authorId);
  const i = order.indexOf(userId);
  return i < 0 ? '익명' : `익명 ${i + 1}`;
}

export const BOARD_LABEL: Record<BoardKind, string> = { anon: '익명 게시판', lawyer: '변호사 게시판' };

export function boardOf(post: BoardPost): BoardKind {
  return post.board ?? 'anon';
}

/** 변호사 게시판은 변호사 계정만 보고 씁니다. */
export function canSeeBoard(u: User, board: BoardKind): boolean {
  return board === 'anon' || u.role === 'lawyer';
}

export type AuthorView = {
  alias: string;
  /** 익명 게시판: 어드민에게만 보이는 실제 작성자 */
  real?: string;
  /** 변호사 게시판: 공개되는 메신저 프로필 */
  profile?: User;
};

export function authorView(viewer: User, post: BoardPost, authorId: string, users: User[]): AuthorView {
  const u = users.find((x) => x.id === authorId);
  if (boardOf(post) === 'lawyer') return { alias: u?.nickname ?? '알 수 없음', profile: u };
  return { alias: aliasIn(post, authorId), real: viewer.role === 'admin' && u ? `${u.nickname} · ${ROLE_LABEL[u.role]}` : undefined };
}

/** 쪽지 상대 이름: 익명 게시판은 '익명 N', 변호사 게시판은 실명 */
export function nameIn(post: BoardPost | undefined, userId: string, users: User[]): string {
  if (!post) return '익명';
  if (boardOf(post) === 'lawyer') return users.find((u) => u.id === userId)?.nickname ?? '알 수 없음';
  return aliasIn(post, userId);
}

export const MAX_ATTACHMENTS = 5;

export function score(votes: Votes): number {
  return Object.values(votes).reduce<number>((a, v) => a + v, 0);
}

/** 같은 표를 다시 누르면 취소, 반대 표를 누르면 바꿉니다. */
export function toggleVote(votes: Votes, userId: string, v: 1 | -1): Votes {
  const next = { ...votes };
  if (next[userId] === v) delete next[userId];
  else next[userId] = v;
  return next;
}

export type BoardSort = 'hot' | 'new' | 'best';
export const BOARD_SORT_LABEL: Record<BoardSort, string> = { hot: '인기', new: '최신', best: '베스트' };

/** 베스트 게시판에 오르는 추천 점수 */
export const BEST_MIN = 20;

export function isBest(p: BoardPost): boolean {
  return score(p.votes) >= BEST_MIN;
}

/** 제목·내용·분야에서 찾습니다. 띄어쓴 단어는 모두 들어 있어야 합니다. */
export function searchPosts(posts: BoardPost[], query: string): BoardPost[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return posts;
  return posts.filter((p) => {
    const hay = `${p.title} ${p.body} ${p.field}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** 인기: 추천과 댓글이 많을수록, 최근 글일수록 위로 */
export function sortPosts(posts: BoardPost[], sort: BoardSort, now = Date.now()): BoardPost[] {
  const hot = (p: BoardPost) => {
    const hours = Math.max(0, (now - Date.parse(p.at)) / 3_600_000);
    return (score(p.votes) + p.comments.length * 0.5 + 1) / Math.pow(hours + 2, 1.5);
  };
  const by = {
    hot: (a: BoardPost, b: BoardPost) => hot(b) - hot(a),
    new: (a: BoardPost, b: BoardPost) => b.at.localeCompare(a.at),
    best: (a: BoardPost, b: BoardPost) => score(b.votes) - score(a.votes) || b.at.localeCompare(a.at),
  }[sort];
  return (sort === 'best' ? posts.filter(isBest) : [...posts]).sort(by);
}

/** 답글을 부모 아래에 들여쓰기 깊이와 함께 펼칩니다. 같은 부모 안에서는 추천순. */
export function commentTree(post: BoardPost): { c: BoardComment; depth: number }[] {
  const out: { c: BoardComment; depth: number }[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    post.comments
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => score(b.votes) - score(a.votes) || a.at.localeCompare(b.at))
      .forEach((c) => {
        out.push({ c, depth });
        walk(c.id, depth + 1);
      });
  };
  walk(undefined, 0);
  return out;
}

export function timeAgo(at: string, now = Date.now()): string {
  const m = Math.floor((now - Date.parse(at)) / 60_000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 60 / 24)}일 전`;
}

export function notesFor(userId: string, notes: NoteThread[]): NoteThread[] {
  return notes
    .filter((n) => n.memberIds.includes(userId))
    .sort((a, b) => (b.messages.at(-1)?.at ?? '').localeCompare(a.messages.at(-1)?.at ?? ''));
}

export function unreadIn(n: NoteThread, userId: string): number {
  const read = n.readAt[userId] ?? '';
  return n.messages.filter((m) => m.senderId !== userId && m.at > read).length;
}

export function otherIn(n: NoteThread, userId: string): string {
  return n.memberIds[0] === userId ? n.memberIds[1] : n.memberIds[0];
}

// ---- 신고·이용 제한 ----

export const REPORT_REASONS = ['욕설·비방', '광고·수임 유도', '개인정보 노출', '음란·불법', '도배', '기타'];

export const RESTRICT_OPTIONS: { label: string; hours: number }[] = [
  { label: '1시간', hours: 1 },
  { label: '1일', hours: 24 },
  { label: '7일', hours: 24 * 7 },
  { label: '30일', hours: 24 * 30 },
];

/** 이용 제한 중이면 해제 시각, 아니면 undefined */
export function restrictedUntil(bans: Record<string, string>, userId: string, now = Date.now()): string | undefined {
  const until = bans[userId];
  return until && Date.parse(until) > now ? until : undefined;
}

export function formatUntil(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 신고 대상의 작성자와 내용 */
export function reportTarget(r: BoardReport, posts: BoardPost[]): { authorId: string; text: string; kind: '글' | '댓글' } | undefined {
  const post = posts.find((p) => p.id === r.postId);
  if (!post) return undefined;
  if (!r.commentId) return { authorId: post.authorId, text: `${post.title}\n${post.body}`, kind: '글' };
  const c = post.comments.find((x) => x.id === r.commentId);
  return c ? { authorId: c.authorId, text: c.text, kind: '댓글' } : undefined;
}
