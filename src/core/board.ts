import type { BoardComment, BoardPost, NoteThread, Role, User, Votes } from './types';

const ROLE_LABEL: Record<Role, string> = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' };

/** 글 안에서의 익명 번호. 글쓴이가 익명 1, 댓글 단 사람은 처음 등장한 순서대로 2, 3… (의뢰인·변호사 구분 없음) */
export function aliasIn(post: BoardPost, userId: string): string {
  const order = [post.authorId];
  for (const c of post.comments) if (!order.includes(c.authorId)) order.push(c.authorId);
  const i = order.indexOf(userId);
  return i < 0 ? '익명' : `익명 ${i + 1}`;
}

export type AuthorView = {
  alias: string;
  /** 어드민에게만 보이는 실제 작성자 */
  real?: string;
};

export function authorView(viewer: User, post: BoardPost, authorId: string, users: User[]): AuthorView {
  const u = users.find((x) => x.id === authorId);
  return { alias: aliasIn(post, authorId), real: viewer.role === 'admin' && u ? `${u.nickname} · ${ROLE_LABEL[u.role]}` : undefined };
}

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

export type BoardSort = 'hot' | 'new' | 'top';
export const BOARD_SORT_LABEL: Record<BoardSort, string> = { hot: '인기', new: '최신', top: '추천순' };

/** 인기: 추천과 댓글이 많을수록, 최근 글일수록 위로 */
export function sortPosts(posts: BoardPost[], sort: BoardSort, now = Date.now()): BoardPost[] {
  const hot = (p: BoardPost) => {
    const hours = Math.max(0, (now - Date.parse(p.at)) / 3_600_000);
    return (score(p.votes) + p.comments.length * 0.5 + 1) / Math.pow(hours + 2, 1.5);
  };
  const by = {
    hot: (a: BoardPost, b: BoardPost) => hot(b) - hot(a),
    new: (a: BoardPost, b: BoardPost) => b.at.localeCompare(a.at),
    top: (a: BoardPost, b: BoardPost) => score(b.votes) - score(a.votes) || b.at.localeCompare(a.at),
  }[sort];
  return [...posts].sort(by);
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
