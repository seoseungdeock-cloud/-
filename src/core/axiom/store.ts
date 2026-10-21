// 공용 저장소: 회의록·매뉴얼·산출물·대화·보고·위원회 기록·회사 상태 — 전부 한 곳에, 개정 이력과 함께.
import * as acl from './acl';
import type { Row, Where } from './db';
import type { AxUser, Ctx } from './types';
import { AxError, clip, newId, now } from './util';

export const KINDS: Record<string, string> = {
  meeting: '회의록',
  manual: '매뉴얼',
  deliverable: '산출물',
  conversation: '대화 기록',
  report: '정기 보고',
  council: '경영위원회 기록',
  state: '회사 상태',
  note: '메모',
};

export async function audit(ctx: Ctx, user: AxUser | null, action: string, target: string | null, detail?: unknown) {
  await ctx.db.insert('audit', {
    id: newId('au_'),
    user_id: user?.id || 'system',
    action,
    target,
    detail: detail ? clip(typeof detail === 'string' ? detail : JSON.stringify(detail), 1000) : null,
    at: now(),
  });
}

/** 사람 이름 붙이기 */
export async function withNames<T extends Row>(ctx: Ctx, rows: T[], col: string, as: string): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r[col]).filter((v) => typeof v === 'string' && v && !v.startsWith('agent:') && v !== 'system'))] as string[];
  const names = ids.length ? await ctx.names(ids) : {};
  return rows.map((r) => ({ ...r, [as]: names[r[col]] ?? null }));
}

function rowOut(ctx: Ctx, d: Row): Row {
  return { ...d, tags: d.tags ?? [], visibility_label: acl.label(d.visibility, ctx.inst), kind_label: KINDS[d.kind] || d.kind };
}

type NewDoc = { kind: string; title: string; body?: string; visibility?: string; tags?: string[]; agent_id?: string | null; run_id?: string | null; ref_type?: string | null; ref_id?: string | null; author_id?: string };

export async function createDoc(ctx: Ctx, user: AxUser, d: NewDoc) {
  if (!KINDS[d.kind]) throw new AxError(400, `문서 종류가 올바르지 않습니다: ${d.kind}`);
  const title = String(d.title || '').trim();
  if (!title) throw new AxError(400, '제목은 필수입니다.');
  if (title.length > 200) throw new AxError(400, '제목은 200자 이내로 적어 주세요.');
  const vis = acl.normalize(d.visibility || ctx.inst.default_visibility || 'org', ctx.inst);
  const id = newId('d_');
  const t = now();
  const author = d.author_id || user.id;
  await ctx.db.insert('documents', {
    id, kind: d.kind, title, body: String(d.body ?? ''), visibility: vis, author_id: author, agent_id: d.agent_id ?? null, run_id: d.run_id ?? null,
    ref_type: d.ref_type ?? null, ref_id: d.ref_id ?? null, tags: d.tags ?? [], rev: 1, created_at: t, updated_at: t,
  });
  await ctx.db.insert('doc_revisions', { doc_id: id, rev: 1, title, body: String(d.body ?? ''), edited_by: author, at: t });
  await audit(ctx, user, 'doc.create', id, `${d.kind}: ${title}`);
  return (await getDoc(ctx, null, id))!;
}

export async function getDoc(ctx: Ctx, user: AxUser | null, id: string) {
  const d = await ctx.db.one('documents', { eq: { id } });
  if (!d) throw new AxError(404, '문서를 찾을 수 없습니다.');
  if (user) acl.assertSee(user, d.visibility);
  const [named] = await withNames(ctx, [d], 'author_id', 'author_name');
  return rowOut(ctx, named);
}

export async function updateDoc(ctx: Ctx, user: AxUser, id: string, p: { title?: string; body?: string; visibility?: string; tags?: string[] }) {
  const d = await getDoc(ctx, user, id);
  if (['conversation', 'council'].includes(d.kind) && p.body !== undefined) throw new AxError(400, '대화 기록·위원회 기록은 시스템이 남기는 원본이라 본문을 고칠 수 없습니다.');
  // 열람 권한이 있으면 누구나 고칠 수 있다(협업 원칙). 대신 모든 개정은 이력으로 남는다.
  const nt = p.title !== undefined ? String(p.title).trim() : d.title;
  const nb = p.body !== undefined ? String(p.body) : d.body;
  const nv = p.visibility !== undefined ? acl.normalize(p.visibility, ctx.inst) : d.visibility;
  if (!nt) throw new AxError(400, '제목은 필수입니다.');
  if (nv !== d.visibility && user.role !== 'admin' && d.author_id !== user.id) throw new AxError(403, '공개 등급은 작성자나 관리자만 바꿀 수 있습니다.');
  if (nv !== d.visibility && !acl.canSee(user, nv)) throw new AxError(403, '내가 볼 수 없는 공개 등급으로는 바꿀 수 없습니다.');
  const rev = d.rev + 1;
  const t = now();
  await ctx.db.update('documents', { eq: { id } }, { title: nt, body: nb, visibility: nv, tags: p.tags !== undefined ? p.tags : d.tags, rev, updated_at: t });
  await ctx.db.insert('doc_revisions', { doc_id: id, rev, title: nt, body: nb, edited_by: user.id, at: t });
  await audit(ctx, user, 'doc.update', id, `rev ${rev}`);
  return getDoc(ctx, user, id);
}

/** 시스템이 갱신하는 문서(대화 기록 등) — 권한 확인 없이 */
export async function systemUpdateBody(ctx: Ctx, id: string, body: string) {
  await ctx.db.update('documents', { eq: { id } }, { body: String(body), updated_at: now() });
}

export async function revisions(ctx: Ctx, user: AxUser, id: string) {
  await getDoc(ctx, user, id);
  const rows = await ctx.db.find('doc_revisions', { eq: { doc_id: id } }, { order: [['rev', 'desc']], cols: ['rev', 'title', 'edited_by', 'at'] });
  return withNames(ctx, rows, 'edited_by', 'editor');
}

export async function revision(ctx: Ctx, user: AxUser, id: string, rev: number) {
  await getDoc(ctx, user, id);
  const r = await ctx.db.one('doc_revisions', { eq: { doc_id: id, rev: Number(rev) } });
  if (!r) throw new AxError(404, '해당 개정판이 없습니다.');
  return r;
}

export async function listDocs(ctx: Ctx, user: AxUser, q: { kind?: string; q?: string; limit?: number; offset?: number; ref_type?: string; ref_id?: string } = {}) {
  const limit = Math.min(Math.max(1, Number(q.limit) || 50), 200);
  const offset = Math.max(0, Number(q.offset) || 0);
  const where: Where = { ...acl.filter(user), eq: {} };
  if (q.kind) where.eq!.kind = q.kind;
  if (q.ref_type) where.eq!.ref_type = q.ref_type;
  if (q.ref_id) where.eq!.ref_id = q.ref_id;
  const words = String(q.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length) where.search = { cols: ['title', 'body'], words };
  const rows = await ctx.db.find('documents', where, {
    order: [['updated_at', 'desc']],
    limit,
    offset,
    cols: ['id', 'kind', 'title', 'body', 'visibility', 'author_id', 'agent_id', 'rev', 'created_at', 'updated_at', 'ref_type', 'ref_id'],
  });
  const named = await withNames(ctx, rows, 'author_id', 'author_name');
  return named.map(({ body, ...r }) => {
    const out = rowOut(ctx, { ...r, preview: String(body ?? '').slice(0, 240) });
    if (words.length) {
      const text = String(body ?? '');
      const i = text.toLowerCase().indexOf(words[0].toLowerCase());
      if (i >= 0) out.snip = `${i > 16 ? '…' : ''}${text.slice(Math.max(0, i - 16), i)}«${text.slice(i, i + words[0].length)}»${text.slice(i + words[0].length, i + words[0].length + 40)}…`;
    }
    return out;
  });
}
