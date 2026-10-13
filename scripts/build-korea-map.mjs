// 시·도 경계 GeoJSON을 앱용 SVG 경로로 변환합니다.
// 원본: southkorea/southkorea-maps (KOSTAT 2013, 단순화본)
// 사용: node scripts/build-korea-map.mjs <geojson 경로>
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('GeoJSON 경로를 넘겨주세요');
const geo = JSON.parse(readFileSync(src, 'utf8'));

// 2023년 이후 명칭으로 정리
const NAMES = {
  '11': ['서울특별시', '서울'], '21': ['부산광역시', '부산'], '22': ['대구광역시', '대구'],
  '23': ['인천광역시', '인천'], '24': ['광주광역시', '광주'], '25': ['대전광역시', '대전'],
  '26': ['울산광역시', '울산'], '29': ['세종특별자치시', '세종'], '31': ['경기도', '경기'],
  '32': ['강원특별자치도', '강원'], '33': ['충청북도', '충북'], '34': ['충청남도', '충남'],
  '35': ['전북특별자치도', '전북'], '36': ['전라남도', '전남'], '37': ['경상북도', '경북'],
  '38': ['경상남도', '경남'], '39': ['제주특별자치도', '제주'],
};

const W = 400;
const lon0 = 124.5, lon1 = 131.0, lat0 = 33.0, lat1 = 38.7;
const kx = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
const scale = W / ((lon1 - lon0) * kx);
const H = Math.round((lat1 - lat0) * scale);
const proj = ([lon, lat]) => [(lon - lon0) * kx * scale, (lat1 - lat) * scale];

const ringArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

const regions = geo.features.map((f) => {
  const code = f.properties.code;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = '';
  let best = { area: 0, cx: 0, cy: 0 };
  for (const poly of polys) {
    const outer = poly[0].map(proj);
    const area = ringArea(outer);
    if (area < 1.5) continue; // 아주 작은 섬은 생략
    const pts = [];
    for (const p of outer) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.8) pts.push(p);
    }
    if (pts.length < 3) continue;
    d += 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
    if (area > best.area) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      best = { area, cx, cy };
    }
  }
  const [name, short] = NAMES[code];
  return { code, name, short, d, cx: +best.cx.toFixed(1), cy: +best.cy.toFixed(1) };
}).sort((a, b) => a.code.localeCompare(b.code));

const out = `// 자동 생성 파일: scripts/build-korea-map.mjs 로 다시 만듭니다. 직접 수정하지 마세요.
// 원본 경계: southkorea/southkorea-maps (KOSTAT 2013)

export type MapRegion = { code: string; name: string; short: string; d: string; cx: number; cy: number };

export const KOREA_MAP_VIEWBOX = { width: ${W}, height: ${H} };

export const KOREA_REGIONS: MapRegion[] = ${JSON.stringify(regions, null, 0).replace(/},{/g, '},\n  {')};
`;
writeFileSync(new URL('../src/data/korea-map.ts', import.meta.url), out);
console.log('regions', regions.length, 'bytes', out.length, 'viewBox', W, H);
