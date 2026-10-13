// 법대륜 사무소·변호사 CSV를 src/data/offices.json 으로 바꿉니다.
// 사용: node scripts/import-offices.mjs <CSV 경로>
// CSV 첫 줄(머리글): 사무소명,시도,주소,전화,위도,경도,변호사명,분야,경력,상담료
//  - 한 줄에 변호사 한 명. 같은 사무소명은 하나로 묶입니다.
//  - 분야는 세미콜론(;)으로 구분. 예: 이혼;상속
//  - 시도는 "서울", "서울특별시", "경기" 같은 이름 모두 됩니다.
import { readFileSync, writeFileSync } from 'node:fs';

const REGION = {
  서울: '11', 부산: '21', 대구: '22', 인천: '23', 광주: '24', 대전: '25', 울산: '26', 세종: '29',
  경기: '31', 강원: '32', 충북: '33', 충청북: '33', 충남: '34', 충청남: '34', 전북: '35', 전라북: '35',
  전남: '36', 전라남: '36', 경북: '37', 경상북: '37', 경남: '38', 경상남: '38', 제주: '39',
};

function regionCode(name) {
  const key = Object.keys(REGION).sort((a, b) => b.length - a.length).find((k) => name.startsWith(k));
  if (!key) throw new Error(`시도를 알 수 없습니다: ${name}`);
  return REGION[key];
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const file = process.argv[2];
if (!file) throw new Error('CSV 경로를 넘겨주세요');
const [header, ...rows] = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const idx = (name) => {
  const i = header.findIndex((h) => h.trim() === name);
  if (i < 0) throw new Error(`머리글에 '${name}'이 없습니다`);
  return i;
};
const col = Object.fromEntries(['사무소명', '시도', '주소', '전화', '위도', '경도', '변호사명', '분야', '경력', '상담료'].map((n) => [n, idx(n)]));

const offices = new Map();
rows.forEach((r, n) => {
  const get = (k) => (r[col[k]] ?? '').trim();
  const name = get('사무소명');
  if (!offices.has(name)) {
    offices.set(name, {
      id: `of_${offices.size + 1}`,
      name,
      regionCode: regionCode(get('시도')),
      address: get('주소'),
      phone: get('전화'),
      ...(get('위도') && get('경도') ? { lat: Number(get('위도')), lon: Number(get('경도')) } : {}),
      lawyers: [],
    });
  }
  const lawyerName = get('변호사명');
  if (lawyerName) {
    offices.get(name).lawyers.push({
      id: `lw_${n + 1}`,
      name: lawyerName,
      fields: get('분야').split(';').map((s) => s.trim()).filter(Boolean),
      careerYears: Number(get('경력')) || 0,
      consultFee: Number(get('상담료').replace(/[^\d]/g, '')) || 0,
      intro: '',
    });
  }
});

const out = { _안내: '법대륜 데이터 (scripts/import-offices.mjs 로 생성)', offices: [...offices.values()] };
writeFileSync(new URL('../src/data/offices.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`사무소 ${offices.size}곳, 변호사 ${out.offices.reduce((s, o) => s + o.lawyers.length, 0)}명 저장`);
