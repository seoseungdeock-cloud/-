// 한글 파일(HWP 5.0, HWPX)에서 본문 글자만 뽑기 (@AI 오타 검수·요약용, 승덕 2026-10-22).
// 압축 풀기는 부르는 쪽이 넘겨줍니다(서버 함수는 fflate). 암호·배포용 문서는 읽지 않습니다.

export type Inflate = (data: Uint8Array) => Uint8Array;
export type Unzip = (data: Uint8Array) => Record<string, Uint8Array>;

const END = 0xfffffffa;

/** HWP가 쓰는 OLE(복합 문서) 파일에서 이름으로 스트림을 꺼냅니다 */
export function readCfb(buf: Uint8Array): { stream: (path: string[]) => Uint8Array | null; names: () => string[] } {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u32 = (o: number) => v.getUint32(o, true);
  if (u32(0) !== 0xe011cfd0 || u32(4) !== 0xe11ab1a1) throw new Error('not cfb');
  const ssz = 1 << v.getUint16(30, true);
  const msz = 1 << v.getUint16(32, true);
  const sec = (id: number) => buf.subarray((id + 1) * ssz, (id + 2) * ssz);
  // FAT 섹터 목록 (머리글 109개 + DIFAT 사슬)
  const fatSecs: number[] = [];
  for (let i = 0; i < 109; i++) fatSecs.push(u32(76 + i * 4));
  for (let d = u32(68), n = u32(72); n > 0 && d < END; n--) {
    const s = new DataView(sec(d).buffer, sec(d).byteOffset, ssz);
    for (let i = 0; i < ssz / 4 - 1; i++) fatSecs.push(s.getUint32(i * 4, true));
    d = s.getUint32(ssz - 4, true);
  }
  const fat: number[] = [];
  for (const id of fatSecs.slice(0, u32(44))) {
    const s = sec(id);
    const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    for (let i = 0; i < ssz / 4; i++) fat.push(dv.getUint32(i * 4, true));
  }
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    for (let id = start; id < END && out.length <= table.length; id = table[id]) out.push(id);
    return out;
  };
  const join = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) (out.set(p, o), (o += p.length));
    return out;
  };
  const big = (start: number, size: number) => join(chain(start, fat).map(sec)).subarray(0, size);
  const dir = big(u32(48), Infinity);
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  type E = { name: string; type: number; left: number; right: number; child: number; start: number; size: number };
  const entries: E[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = dv.getUint16(o + 64, true);
    let name = '';
    for (let i = 0; i < Math.max(0, len / 2 - 1); i++) name += String.fromCharCode(dv.getUint16(o + i * 2, true));
    entries.push({ name, type: dir[o + 66], left: dv.getUint32(o + 68, true), right: dv.getUint32(o + 72, true), child: dv.getUint32(o + 76, true), start: dv.getUint32(o + 116, true), size: dv.getUint32(o + 120, true) });
  }
  const root = entries[0];
  const miniFat: number[] = [];
  if (u32(64)) {
    const m = big(u32(60), u32(64) * ssz);
    const mv = new DataView(m.buffer, m.byteOffset, m.byteLength);
    for (let i = 0; i < m.length / 4; i++) miniFat.push(mv.getUint32(i * 4, true));
  }
  const miniStream = root.start < END ? big(root.start, root.size) : new Uint8Array();
  const cutoff = u32(56);
  const children = (e: E): E[] => {
    const out: E[] = [];
    const walk = (i: number, depth: number) => {
      if (i >= END || i >= entries.length || depth > 64) return;
      const x = entries[i];
      walk(x.left, depth + 1);
      out.push(x);
      walk(x.right, depth + 1);
    };
    walk(e.child, 0);
    return out;
  };
  const read = (e: E) => (e.size < cutoff ? join(chain(e.start, miniFat).map((id) => miniStream.subarray(id * msz, (id + 1) * msz))).subarray(0, e.size) : big(e.start, e.size));
  return {
    stream(path) {
      let cur: E | undefined = root;
      for (const p of path) cur = cur && children(cur).find((c) => c.name === p);
      return cur && cur.type === 2 ? read(cur) : null;
    },
    names: () => children(root).map((c) => c.name),
  };
}

const ONE = new Set([0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31]);

/** HWP 문단 글(PARA_TEXT) 하나를 글자로: 조판 부호는 건너뜀 */
function paraText(rec: Uint8Array): string {
  const dv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  let s = '';
  for (let i = 0; i + 1 < rec.length; ) {
    const c = dv.getUint16(i, true);
    if (c >= 32) {
      s += String.fromCharCode(c);
      i += 2;
    } else if (ONE.has(c)) {
      if (c === 10) s += '\n';
      else if (c === 24) s += '-';
      else if (c === 30 || c === 31) s += ' ';
      i += 2;
    } else {
      if (c === 9) s += '\t';
      i += 16;
    }
  }
  return s;
}

/** HWP 5.0 본문 → 글 (문단마다 줄바꿈) */
export function hwpText(buf: Uint8Array, inflateRaw: Inflate): string {
  const cfb = readCfb(buf);
  const head = cfb.stream(['FileHeader']);
  if (!head || new TextDecoder().decode(head.subarray(0, 17)) !== 'HWP Document File') throw new Error('not hwp');
  const flags = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(36, true);
  if (flags & 0b110) throw new Error('암호가 걸렸거나 배포용으로 저장된 한글 문서는 읽을 수 없습니다.');
  const compressed = (flags & 1) === 1;
  const out: string[] = [];
  for (let n = 0; ; n++) {
    let sec = cfb.stream(['BodyText', `Section${n}`]);
    if (!sec) break;
    if (compressed) sec = inflateRaw(sec);
    const dv = new DataView(sec.buffer, sec.byteOffset, sec.byteLength);
    for (let i = 0; i + 4 <= sec.length; ) {
      const h = dv.getUint32(i, true);
      let size = h >>> 20;
      i += 4;
      if (size === 0xfff) {
        size = dv.getUint32(i, true);
        i += 4;
      }
      if ((h & 0x3ff) === 67) out.push(paraText(sec.subarray(i, i + size)));
      i += size;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const XML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** HWPX(압축된 XML) 본문 → 글 */
export function hwpxText(buf: Uint8Array, unzip: Unzip): string {
  const files = unzip(buf);
  const secs = Object.keys(files)
    .filter((k) => /^Contents\/section\d+\.xml$/i.test(k))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!secs.length) throw new Error('not hwpx');
  const dec = new TextDecoder();
  return secs
    .map((k) =>
      dec
        .decode(files[k])
        .replace(/<\/hp:p>/g, '\n')
        .replace(/<hp:tab\b[^>]*\/>/g, '\t')
        .replace(/<hp:lineBreak\b[^>]*\/>/g, '\n')
        .replace(/<(?!\/?hp:t\b)[^>]+>/g, '')
        .replace(/<hp:t\b[^>]*>|<\/hp:t>/g, '')
        .replace(/&(\w+|#\d+);/g, (m, e: string) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : XML_ENT[e] ?? m))
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
