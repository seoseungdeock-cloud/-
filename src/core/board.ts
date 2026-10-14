import { LAW_BOT, LAW_BOT_NAME } from './law-digest';
import type { BoardComment, BoardKind, BoardPost, BoardReport, NoteThread, Role, User, Votes } from './types';

const ROLE_LABEL: Record<Role, string> = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' };

/** 글 안에서의 익명 번호. 글쓴이가 익명 1, 댓글 단 사람은 처음 등장한 순서대로 2, 3… (의뢰인·변호사 구분 없음) */
export function aliasIn(post: BoardPost, userId: string): string {
  const n = post.aliases?.[userId];
  if (n) return `익명 ${n}`;
  const order = [post.authorId];
  for (const c of post.comments) if (!order.includes(c.authorId)) order.push(c.authorId);
  const i = order.indexOf(userId);
  return i < 0 ? '익명' : `익명 ${i + 1}`;
}

export const BOARD_LABEL: Record<BoardKind, string> = { notice: '공지', anon: '익명 게시판', lawyer: '변호사 게시판', advice: '사건자문', event: '경조사·공익', praise: '고객만족사례', lawnews: '법령개정·최신판례', skyzai: 'SKYZAI' };

/** 게시판 탭에 쓰는 짧은 이름 */
export const BOARD_TAB: Record<BoardKind, string> = { notice: '공지', anon: '익명', lawyer: '변호사', advice: '사건자문', event: '경조사·공익', praise: '고객만족', lawnews: '법령·판례', skyzai: 'SKYZAI' };

/** 게시판 탭 순서: 공지가 맨 앞 */
const BOARD_ORDER: BoardKind[] = ['notice', 'anon', 'lawyer', 'advice', 'event', 'praise', 'lawnews', 'skyzai'];

export function boardOf(post: BoardPost): BoardKind {
  return post.board ?? 'anon';
}

/**
 * 익명 게시판: 모든 계정. 변호사 게시판·사건자문·경조사·공익·고객만족사례·법령개정·최신판례: 변호사 계정만.
 * 공지·SKYZAI: 변호사 계정과, 공지를 올리는 어드민 계정.
 */
export function canSeeBoard(u: User, board: BoardKind): boolean {
  if (board === 'anon') return true;
  if (board === 'lawyer' || board === 'advice' || board === 'event' || board === 'praise' || board === 'lawnews') return u.role === 'lawyer';
  return u.role === 'lawyer' || u.role === 'admin';
}

export function boardsFor(u: User): BoardKind[] {
  return BOARD_ORDER.filter((b) => canSeeBoard(u, b));
}

/** 공지 게시판 글과 SKYZAI 공지 글은 어드민만 씁니다. */
export function canWriteBoard(u: User, board: BoardKind, notice = false): boolean {
  if (!canSeeBoard(u, board)) return false;
  // 법령개정·최신판례는 매일 오전 7시 자동 글만 (댓글은 누구나)
  if (board === 'lawnews') return false;
  if (board === 'notice' || (board === 'skyzai' && notice)) return u.role === 'admin';
  return true;
}

/** 익명 게시판만 익명, 나머지는 메신저 프로필 공개 */
export function isRealName(board: BoardKind): boolean {
  return board !== 'anon';
}

/** 분야 태그를 고르는 게시판 */
export function needsField(board: BoardKind): boolean {
  return board === 'anon' || board === 'lawyer' || board === 'advice' || board === 'praise';
}

export function isNoticePost(p: BoardPost): boolean {
  return boardOf(p) === 'notice' || (boardOf(p) === 'skyzai' && !!p.notice);
}

/** 아직 확인하지 않은 공지 (게시판 맨 위 팝업), 최신순. 내가 쓴 공지는 빼고. */
export function unseenNotices(u: User, posts: BoardPost[], seen: string[]): BoardPost[] {
  return posts
    .filter((p) => isNoticePost(p) && p.authorId !== u.id && canSeeBoard(u, boardOf(p)) && !seen.includes(p.id))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** SKYZAI 공지 글은 목록 맨 위에 고정 */
export function pinNotices(posts: BoardPost[]): BoardPost[] {
  return [...posts.filter((p) => p.notice), ...posts.filter((p) => !p.notice)];
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
  if (authorId === LAW_BOT) return { alias: LAW_BOT_NAME };
  if (isRealName(boardOf(post))) return { alias: u?.nickname ?? '알 수 없음', profile: u };
  return { alias: aliasIn(post, authorId), real: viewer.role === 'admin' && u ? `${u.nickname} · ${ROLE_LABEL[u.role]}` : undefined };
}

/** 쪽지 상대 이름: 익명 게시판은 '익명 N', 변호사 게시판은 실명 */
export function nameIn(post: BoardPost | undefined, userId: string, users: User[]): string {
  if (!post) return '익명';
  if (isRealName(boardOf(post))) return users.find((u) => u.id === userId)?.nickname ?? '알 수 없음';
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
