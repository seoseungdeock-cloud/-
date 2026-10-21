// AXIOM 저장 계층. 엔진은 표 이름과 조건만 말하고, 실제 저장은 두 가지 중 하나가 맡습니다.
//   MemoryDb   — 앱 안 체험(서버 없이, 모의 응답)과 시험
//   서버 함수   — Supabase(Postgres) 의 ax_* 표 (supabase/functions/axiom)

export type Row = Record<string, any>;

export type Table =
  | 'documents'
  | 'doc_revisions'
  | 'agents'
  | 'agent_versions'
  | 'conversations'
  | 'messages'
  | 'runs'
  | 'councils'
  | 'approvals'
  | 'work_orders'
  | 'forecasts'
  | 'schedules'
  | 'audit';

export type Where = {
  /** 같음 (null 이면 비어 있음) */
  eq?: Row;
  neq?: Row;
  in?: Record<string, unknown[]>;
  gt?: Row;
  gte?: Row;
  lte?: Row;
  /** 낱말마다 cols 중 하나에 들어 있어야 함 (대소문자 무시) */
  search?: { cols: string[]; words: string[] };
};

export type FindOpts = { order?: [string, 'asc' | 'desc'][]; limit?: number; offset?: number; cols?: string[] };

export interface Db {
  one(table: Table, where: Where): Promise<Row | null>;
  find(table: Table, where: Where, opts?: FindOpts): Promise<Row[]>;
  insert(table: Table, row: Row): Promise<void>;
  /** 조건에 맞는 줄을 고치고 고친 줄 수를 돌려줍니다 */
  update(table: Table, where: Where, patch: Row): Promise<number>;
}

const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function matches(r: Row, w: Where): boolean {
  for (const [k, v] of Object.entries(w.eq ?? {})) if (v === null ? r[k] != null : r[k] !== v) return false;
  for (const [k, v] of Object.entries(w.neq ?? {})) if (r[k] === v) return false;
  for (const [k, vs] of Object.entries(w.in ?? {})) if (!vs.includes(r[k])) return false;
  for (const [k, v] of Object.entries(w.gt ?? {})) if (!(r[k] != null && r[k] > v)) return false;
  for (const [k, v] of Object.entries(w.gte ?? {})) if (!(r[k] != null && r[k] >= v)) return false;
  for (const [k, v] of Object.entries(w.lte ?? {})) if (!(r[k] != null && r[k] <= v)) return false;
  if (w.search) {
    for (const word of w.search.words) {
      const lw = word.toLowerCase();
      if (!w.search.cols.some((c) => String(r[c] ?? '').toLowerCase().includes(lw))) return false;
    }
  }
  return true;
}

export class MemoryDb implements Db {
  private t = new Map<Table, Row[]>();
  private rows(table: Table) {
    let r = this.t.get(table);
    if (!r) this.t.set(table, (r = []));
    return r;
  }
  async one(table: Table, where: Where) {
    const r = this.rows(table).find((x) => matches(x, where));
    return r ? copy(r) : null;
  }
  async find(table: Table, where: Where, opts: FindOpts = {}) {
    let list = this.rows(table).filter((x) => matches(x, where));
    if (opts.order?.length) {
      const order = opts.order;
      list = [...list].sort((a, b) => {
        for (const [k, dir] of order) {
          const x = a[k] ?? '';
          const y = b[k] ?? '';
          if (x < y) return dir === 'asc' ? -1 : 1;
          if (x > y) return dir === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    const off = opts.offset ?? 0;
    list = list.slice(off, opts.limit != null ? off + opts.limit : undefined);
    return list.map((r) => {
      if (!opts.cols) return copy(r);
      const o: Row = {};
      for (const c of opts.cols) o[c] = copy(r[c]);
      return o;
    });
  }
  async insert(table: Table, row: Row) {
    this.rows(table).push(copy(row));
  }
  async update(table: Table, where: Where, patch: Row) {
    let n = 0;
    for (const r of this.rows(table)) {
      if (!matches(r, where)) continue;
      Object.assign(r, copy(patch));
      n++;
    }
    return n;
  }
}
