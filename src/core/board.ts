import type { BoardPost, Role, User } from './types';

const ROLE_LABEL: Record<Role, string> = { client: '의뢰인', lawyer: '변호사', staff: '직원', admin: '어드민' };

/** 글 안에서의 익명 이름. 글쓴이는 '글쓴이', 나머지는 처음 등장한 순서대로 '익명 1, 2…' */
export function aliasIn(post: BoardPost, userId: string): string {
  if (userId === post.authorId) return '글쓴이';
  const order: string[] = [];
  for (const c of post.comments) if (c.authorId !== post.authorId && !order.includes(c.authorId)) order.push(c.authorId);
  return `익명 ${order.indexOf(userId) + 1}`;
}

export type AuthorView = {
  alias: string;
  /** 변호사가 쓴 글·댓글에만 붙는 표시 (이름은 숨김) */
  lawyer: boolean;
  /** 어드민에게만 보이는 실제 작성자 */
  real?: string;
};

export function authorView(viewer: User, post: BoardPost, authorId: string, users: User[]): AuthorView {
  const u = users.find((x) => x.id === authorId);
  return {
    alias: aliasIn(post, authorId),
    lawyer: u?.role === 'lawyer',
    real: viewer.role === 'admin' && u ? `${u.nickname} · ${ROLE_LABEL[u.role]}` : undefined,
  };
}
