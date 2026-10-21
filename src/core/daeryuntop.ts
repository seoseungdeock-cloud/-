// 대륜탑 기일 연동: 대륜탑 기일 한 줄의 모양(서버 함수 daeryuntop-hearing과 같음)과,
// API가 생기기 전 임시로 쓰는 '엑셀 올리기'(대륜탑 전체 사건 목록 → 엑셀 다운로드 파일) 읽기.
// 처리 규칙은 서버의 ingest_daeryuntop_hearing과 같고, 로컬(시연) 모드에서는 classify를 씁니다.

/** 대륜탑 기일 한 줄. 의뢰인 이름·연락처는 담지 않습니다. */
export type DtHearing = {
  id: string;
  caseNo?: string;
  caseRef?: string;
  official?: boolean;
  party?: '우리측' | '상대측' | '확인용';
  name: string;
  date: string;
  time?: string;
  court?: string;
  place?: string;
  flags?: string[];
  deleted?: boolean;
};

export type DtResult = { id: string; caseNo?: string; result: string };

export const DT_FLAGS = ['불변', '엄수', '추정', '변경', '재개', '부진행', '완료', '기일소거'] as const;

/** 기일 한 줄을 어떻게 처리할지 (서버 규칙과 같음) */
export type DtPlan =
  | { kind: 'skip'; reason: string }
  | { kind: 'deadline'; handled: boolean; cancelled: boolean }
  | { kind: 'hearing'; cancelled?: string; done: boolean; label: string; time?: string; place?: string; firmOnly: boolean; strict: boolean };

export function classify(h: DtHearing): DtPlan {
  if (!h.id) return { kind: 'skip', reason: '기일 번호 없음' };
  if (h.official === false) return { kind: 'skip', reason: '개인 일정' };
  const f = new Set(h.flags ?? []);
  const gone = h.deleted ? '삭제' : f.has('기일소거') ? '기일소거' : f.has('추정') ? '추정' : f.has('부진행') ? '부진행' : undefined;
  if (f.has('불변')) return { kind: 'deadline', handled: f.has('완료'), cancelled: !!gone };
  const strict = f.has('엄수');
  const name = (h.name || '기일').trim().slice(0, 50);
  return {
    kind: 'hearing',
    ...(gone ? { cancelled: gone } : {}),
    done: f.has('완료'),
    label: strict ? `${name} [엄수]` : name,
    // 대륜탑은 시각이 없으면 00:00으로 둡니다
    ...(h.time && h.time !== '00:00' ? { time: h.time } : {}),
    ...([h.court, h.place].filter((x) => x?.trim()).length ? { place: [h.court, h.place].filter((x) => x?.trim()).map((x) => x!.trim()).join(' ') } : {}),
    firmOnly: h.party === '확인용' || h.party === '상대측' || name.startsWith('(확인용)'),
    strict,
  };
}

/** 결과 묶음 → '새 기일 2 · 변경 1 …' */
export function summarize(results: DtResult[]): { text: string; unlinked: string[] } {
  const count = (k: string) => results.filter((r) => r.result === k).length;
  const parts = [
    ['새 기일', count('new')], ['기일 변경', count('changed')], ['기일 취소', count('cancelled')], ['불변기간', count('deadline')], ['그대로', count('same')],
    ['건너뜀', results.filter((r) => r.result.startsWith('skip:') && r.result !== 'skip:연결 안 된 사건').length],
  ].filter(([, n]) => n) as [string, number][];
  const unlinked = [...new Set(results.filter((r) => r.result === 'skip:연결 안 된 사건').map((r) => r.caseNo ?? '').filter(Boolean))];
  return { text: parts.map(([k, n]) => `${k} ${n}`).join(' · ') || '받은 기일이 없습니다', unlinked };
}

// ───────── 엑셀 표 → 기일 줄 ─────────

const COLS: Record<string, string[]> = {
  caseNo: ['사건번호'],
  name: ['기일명'],
  date: ['진행일', '진행/잔여일', '진행일시', '기일일자'],
  time: ['시각'],
  flags: ['기일-특이사항', '특이사항'],
  court: ['법원(기관)'],
  place: ['장소'],
  party: ['기일 대상자', '기일대상자'],
};

const norm = (s: string) => s.replace(/\s+/g, '').trim();

/** '2026-10-21 [D-0]', '2026.10.21 (수)', 엑셀 날짜 숫자 → '2026-10-21' */
export function cellDate(v: string): string | undefined {
  const m = v.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const n = Number(v);
  if (v.trim() && Number.isFinite(n) && n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
  return undefined;
}

/** '14:00', '14시 00분', 엑셀 시간 숫자(0.583…) → '14:00' */
export function cellTime(v: string): string | undefined {
  const m = v.match(/(\d{1,2})\s*[:시]\s*(\d{2})/);
  if (m && Number(m[1]) < 24) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const n = Number(v);
  if (v.trim() && Number.isFinite(n) && n >= 0 && n < 1) {
    const min = Math.round(n * 1440);
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  return undefined;
}

export function cellFlags(v: string): string[] {
  return v.split(/[·,/\s]+/).map((x) => x.trim()).filter((x) => (DT_FLAGS as readonly string[]).includes(x));
}

/**
 * 대륜탑 '전체 사건 목록' 엑셀 표에서 기일 줄을 뽑습니다. 제목 줄이 위에 있어도 '사건번호'와 '기일명'이 있는 줄을 찾아 머리글로 씁니다.
 * 목록에는 사건마다 가장 가까운 기일 하나만 나오고 기일 번호가 없어, 번호는 '사건번호:기일명:날짜'로 만듭니다.
 */
export function rowsFromTable(table: string[][]): { rows: DtHearing[]; error?: string } {
  const head = table.findIndex((r) => r.some((c) => norm(c) === '사건번호') && r.some((c) => norm(c) === '기일명'));
  if (head < 0) return { rows: [], error: "'사건번호'와 '기일명' 칸이 있는 대륜탑 사건 목록 엑셀을 올려 주세요." };
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(COLS)) {
    const i = table[head].findIndex((c) => names.some((n) => norm(n) === norm(c)));
    if (i >= 0) idx[k] = i;
  }
  if (idx.date === undefined) return { rows: [], error: "기일 날짜 칸('진행일' 또는 '진행/잔여일')을 찾지 못했습니다." };
  const get = (r: string[], k: string) => (idx[k] === undefined ? '' : (r[idx[k]] ?? '').trim());
  const rows: DtHearing[] = [];
  for (const r of table.slice(head + 1)) {
    const caseNo = get(r, 'caseNo');
    const name = get(r, 'name');
    const date = cellDate(get(r, 'date'));
    if (!caseNo || !name || name === '-' || !date) continue;
    const party = get(r, 'party');
    const time = cellTime(get(r, 'time'));
    rows.push({
      id: `xl:${caseNo}:${name}:${date}`, caseNo, name, date,
      ...(time ? { time } : {}),
      ...(get(r, 'court') && get(r, 'court') !== '-' ? { court: get(r, 'court') } : {}),
      ...(get(r, 'place') && get(r, 'place') !== '-' ? { place: get(r, 'place') } : {}),
      ...(party === '우리측' || party === '상대측' || party === '확인용' ? { party } : {}),
      flags: cellFlags(get(r, 'flags')),
    });
  }
  return { rows };
}

// ───────── 파일 읽기 (PC 웹) ─────────

const xmlText = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

/** 엑셀(xlsx) 시트 XML → 표 */
export function sheetTable(sheetXml: string, shared: string[]): string[][] {
  const table: string[][] = [];
  for (const row of sheetXml.match(/<row[\s>][\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const m of row.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
      const col = ref ? [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : cells.length;
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const inner = m[2] ?? '';
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      cells[col] = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? xmlText(inner) : xmlText(v);
    }
    table.push(Array.from(cells, (c) => c ?? ''));
  }
  return table;
}

export function sharedStrings(xml: string): string[] {
  return (xml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) => (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []).map(xmlText).join(''));
}

/** HTML 표(.xls로 내려받은 웹 표 포함) → 표 */
export function htmlTable(html: string): string[][] {
  return (html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) ?? []).map((tr) => (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map((td) => xmlText(td.replace(/<br\s*\/?>/gi, ' ')).replace(/&nbsp;/g, ' ').trim()));
}

export function csvTable(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

/** zip 안의 파일들 (xlsx는 zip). 압축 풀기는 브라우저의 DecompressionStream을 씁니다. */
async function unzip(buf: Uint8Array, want: (name: string) => boolean): Promise<Map<string, string>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('엑셀 파일을 읽지 못했습니다.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!want(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, dec.decode(raw));
    else {
      const stream = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out.set(name, await new Response(stream).text());
    }
  }
  return out;
}

/** 올린 파일(xlsx / 웹 표 .xls / csv) → 표 */
export async function readTableFile(buf: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = await unzip(bytes, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    const sheet = [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
    if (!sheet) throw new Error('엑셀 시트를 찾지 못했습니다.');
    return sheetTable(files.get(sheet)!, sharedStrings(files.get('xl/sharedStrings.xml') ?? ''));
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error("예전 엑셀 형식(.xls)은 읽지 못합니다. 엑셀에서 '다른 이름으로 저장 → .xlsx'로 바꿔 올려 주세요.");
  let text = new TextDecoder('utf-8').decode(bytes);
  // 한글 윈도우 CSV(EUC-KR)
  if (text.includes('�')) text = new TextDecoder('euc-kr').decode(bytes);
  return /<table[\s>]/i.test(text) ? htmlTable(text) : csvTable(text.replace(/^﻿/, ''));
}
