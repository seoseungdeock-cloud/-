// 상담내용으로 불변기간 찾기: 상담 글에서 사건 종류와 기준일(판결문 받은 날 등)을 찾아 법정 불변기간 만료일을 계산합니다.
// 법조문 기준의 자동 계산이라 담당 변호사가 확인한 뒤 등록합니다 (자동 등록하지 않음).
// 기간 계산: 기준일 다음 날부터 셈(초일 불산입, 민법 157조), 끝나는 날이 토·일·공휴일이면 다음 평일(민법 161조).

export type LimitRule = {
  key: string;
  label: string;
  /** 기준일이 무엇인지 */
  basis: string;
  period: { days: number } | { months: number };
  law: string;
  field: '민사' | '형사' | '가사' | '행정' | '기타';
};

export type LimitSuggestion = LimitRule & {
  /** 상담 글에서 찾은 기준일 (못 찾으면 없음) */
  base?: string;
  /** 기준일이 있으면 만료일 */
  due?: string;
  /** 찾은 근거 문장 */
  quote: string;
  /** 주말·공휴일이라 미뤄진 경우 원래 날짜 */
  movedFrom?: string;
};

const R = (key: string, label: string, basis: string, period: LimitRule['period'], law: string, field: LimitRule['field']): LimitRule => ({ key, label, basis, period, law, field });

export const LIMIT_RULES: Record<string, LimitRule> = {
  civilAppeal: R('civilAppeal', '항소기간', '판결문 받은 날', { days: 14 }, '민사소송법 제396조', '민사'),
  civilCassation: R('civilCassation', '상고기간', '항소심 판결문 받은 날', { days: 14 }, '민사소송법 제425조·제396조', '민사'),
  civilImmediate: R('civilImmediate', '즉시항고기간', '결정문 받은 날', { days: 7 }, '민사소송법 제444조', '민사'),
  payOrder: R('payOrder', '지급명령 이의신청기간', '지급명령 받은 날', { days: 14 }, '민사소송법 제470조', '민사'),
  performance: R('performance', '이행권고결정 이의신청기간', '이행권고결정 받은 날', { days: 14 }, '소액사건심판법 제5조의4', '민사'),
  settlement: R('settlement', '화해권고결정 이의신청기간', '화해권고결정 받은 날', { days: 14 }, '민사소송법 제226조', '민사'),
  mediation: R('mediation', '조정에 갈음하는 결정 이의신청기간', '결정문 받은 날', { days: 14 }, '민사조정법 제34조', '민사'),
  retrial: R('retrial', '재심 제기기간', '재심 사유를 안 날', { days: 30 }, '민사소송법 제456조', '민사'),
  familyAppeal: R('familyAppeal', '항소기간', '판결문 받은 날', { days: 14 }, '가사소송법 제19조', '가사'),
  inheritance: R('inheritance', '상속포기·한정승인 기간', '사망(상속 개시)을 안 날', { months: 3 }, '민법 제1019조', '가사'),
  crimAppeal: R('crimAppeal', '항소기간', '판결 선고일', { days: 7 }, '형사소송법 제358조·제343조', '형사'),
  crimCassation: R('crimCassation', '상고기간', '항소심 판결 선고일', { days: 7 }, '형사소송법 제374조·제343조', '형사'),
  crimImmediate: R('crimImmediate', '즉시항고기간', '결정 고지일', { days: 7 }, '형사소송법 제405조', '형사'),
  summary: R('summary', '정식재판청구기간', '약식명령 받은 날', { days: 7 }, '형사소송법 제453조', '형사'),
  prosecutorAppeal: R('prosecutorAppeal', '검찰항고기간', '불기소 통지 받은 날', { days: 30 }, '검찰청법 제10조', '형사'),
  adjudication: R('adjudication', '재정신청기간', '항고기각 통지 받은 날', { days: 10 }, '형사소송법 제260조', '형사'),
  adminSuit: R('adminSuit', '행정소송 제소기간', '처분을 안 날', { days: 90 }, '행정소송법 제20조', '행정'),
  adminAppeal: R('adminAppeal', '행정심판 청구기간', '처분을 안 날', { days: 90 }, '행정심판법 제27조', '행정'),
  fine: R('fine', '과태료 이의제기기간', '과태료 부과 통지 받은 날', { days: 60 }, '질서위반행위규제법 제20조', '행정'),
  constitution: R('constitution', '헌법소원 청구기간', '기본권 침해를 안 날', { days: 90 }, '헌법재판소법 제69조', '기타'),
};

// 법원 휴무 공휴일 (대체공휴일 포함). 해마다 고시를 확인해 더합니다.
export const HOLIDAYS = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-05', '2026-05-25', '2026-06-03',
  '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-05', '2026-10-09', '2026-12-25',
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-08-16', '2027-09-14',
  '2027-09-15', '2027-09-16', '2027-10-04', '2027-10-11', '2027-12-27',
]);

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function isOffDay(day: string): boolean {
  const w = toDate(day).getUTCDay();
  return w === 0 || w === 6 || HOLIDAYS.has(day);
}

/** 기준일 + 기간 → 만료일 (끝나는 날이 쉬는 날이면 다음 평일) */
export function dueDate(base: string, period: LimitRule['period']): { due: string; movedFrom?: string } {
  const d = toDate(base);
  if ('days' in period) d.setUTCDate(d.getUTCDate() + period.days);
  else {
    // 월 단위: 기간 끝 달의 기준일과 같은 날 (그 날이 없으면 그 달 말일)
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + period.months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  const first = iso(d);
  while (isOffDay(iso(d))) d.setUTCDate(d.getUTCDate() + 1);
  const due = iso(d);
  return due === first ? { due } : { due, movedFrom: first };
}

/** 글 속 날짜들 (위치와 함께). 연도가 없으면 오늘 기준으로 가장 가까운 지난 날. */
export function findDates(text: string, today: string): { at: number; day: string }[] {
  const out: { at: number; day: string }[] = [];
  const t = toDate(today);
  const push = (at: number, y: number, m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const day = iso(new Date(Date.UTC(y, m - 1, d)));
    if (Number(day.slice(8)) !== d) return;
    out.push({ at, day });
  };
  for (const m of text.matchAll(/(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/g)) push(m.index!, Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    if (out.some((o) => m.index! - o.at >= 0 && m.index! - o.at < 9)) continue; // '2026년 10월 15일'의 뒷부분
    let y = t.getUTCFullYear();
    // 연도가 없으면 지난 날로 봄 (한 달 넘게 앞이면 작년)
    if (Date.UTC(y, Number(m[1]) - 1, Number(m[2])) > t.getTime() + 31 * 86_400_000) y -= 1;
    push(m.index!, y, Number(m[1]), Number(m[2]));
  }
  const rel: [RegExp, number][] = [[/오늘/g, 0], [/어제/g, -1], [/그제|그저께/g, -2]];
  for (const [re, n] of rel) for (const m of text.matchAll(re)) out.push({ at: m.index!, day: iso(new Date(t.getTime() + n * 86_400_000)) });
  return out.sort((a, b) => a.at - b.at);
}

type Trigger = { rule: keyof typeof LIMIT_RULES; re: RegExp; when?: (f: Fields) => boolean };
type Fields = { crim: boolean; family: boolean };

const TRIGGERS: Trigger[] = [
  { rule: 'payOrder', re: /지급\s*명령/ },
  { rule: 'performance', re: /이행\s*권고/ },
  { rule: 'settlement', re: /화해\s*권고/ },
  { rule: 'mediation', re: /조정에\s*갈음|강제\s*조정/ },
  { rule: 'summary', re: /약식\s*명령/ },
  { rule: 'adjudication', re: /항고\s*(가\s*)?기각.{0,15}(통지|받|왔)|재정\s*신청/, when: (f) => f.crim },
  { rule: 'prosecutorAppeal', re: /불기소|무혐의|혐의\s*없음|각하\s*처분/, when: (f) => f.crim },
  { rule: 'crimImmediate', re: /즉시\s*항고/, when: (f) => f.crim },
  { rule: 'civilImmediate', re: /즉시\s*항고|결정문/, when: (f) => !f.crim },
  { rule: 'crimCassation', re: /상고|항소\s*(가\s*)?기각|항소심|2심/, when: (f) => f.crim },
  { rule: 'civilCassation', re: /상고|항소\s*(가\s*)?기각|항소심|2심|고등법원/, when: (f) => !f.crim },
  { rule: 'crimAppeal', re: /항소|1심|선고|실형|징역|집행\s*유예|벌금형/, when: (f) => f.crim },
  { rule: 'familyAppeal', re: /항소|1심|판결/, when: (f) => f.family && !f.crim },
  { rule: 'civilAppeal', re: /항소|1심|판결문|판결을\s*받|패소|원고\s*패|일부\s*패/, when: (f) => !f.crim && !f.family },
  { rule: 'retrial', re: /재심/ },
  { rule: 'inheritance', re: /상속\s*포기|한정\s*승인|(돌아가|사망).{0,30}(빚|채무|부채|상속)|(빚|채무|부채).{0,30}(돌아가|사망)/ },
  { rule: 'adminAppeal', re: /행정\s*심판/ },
  { rule: 'adminSuit', re: /행정\s*소송|취소\s*소송|영업\s*정지|과징금|면허\s*(가\s*)?취소|징계\s*(처분|해임|파면)/ },
  { rule: 'fine', re: /과태료/ },
  { rule: 'constitution', re: /헌법\s*소원/ },
];

// 같은 단계라 한쪽만 고르는 짝 (앞의 것이 있으면 뒤의 것은 뺌)
const PREFER: [string, string][] = [
  ['crimCassation', 'crimAppeal'], ['civilCassation', 'civilAppeal'], ['civilCassation', 'familyAppeal'],
  ['adjudication', 'prosecutorAppeal'], ['summary', 'crimAppeal'], ['crimImmediate', 'crimAppeal'], ['civilImmediate', 'civilAppeal'],
];

/** 상담 글 → 불변기간 후보 */
export function suggestLimits(text: string, today: string): LimitSuggestion[] {
  const f: Fields = {
    crim: /형사|피고인|피의자|징역|벌금|집행\s*유예|검사|검찰|공소|기소|고소|약식\s*명령|실형/.test(text),
    family: /이혼|양육|친권|가사|위자료.{0,10}배우자|재산\s*분할/.test(text),
  };
  const dates = findDates(text, today).filter((d) => d.day <= today);
  const found = new Map<string, LimitSuggestion>();
  for (const tr of TRIGGERS) {
    if (tr.when && !tr.when(f)) continue;
    const m = tr.re.exec(text);
    if (!m) continue;
    const rule = LIMIT_RULES[tr.rule];
    // 기준일: 같은 문장 안의 날짜 중 가장 가까운 것, 없으면 글 전체에서 가장 최근 날짜
    const start = Math.max(text.lastIndexOf('\n', m.index), ...['.', '?', '!'].map((p) => text.lastIndexOf(p, m.index))) + 1;
    const endAt = [text.indexOf('\n', m.index), ...['.', '?', '!'].map((p) => text.indexOf(p, m.index + m[0].length))].filter((i) => i >= 0);
    const end = endAt.length ? Math.min(...endAt) : text.length;
    const near = dates.filter((d) => d.at >= start && d.at < end).sort((a, b) => Math.abs(a.at - m.index) - Math.abs(b.at - m.index))[0];
    const base = near?.day ?? [...dates].sort((a, b) => b.day.localeCompare(a.day))[0]?.day;
    const quote = text.slice(start, end).trim().slice(0, 80);
    found.set(rule.key, { ...rule, quote, ...(base ? { base, ...dueDate(base, rule.period) } : {}) });
  }
  for (const [keep, drop] of PREFER) if (found.has(keep)) found.delete(drop);
  return [...found.values()].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
}

export const periodLabel = (p: LimitRule['period']) => ('days' in p ? (p.days % 7 === 0 && p.days <= 14 ? `${p.days / 7}주` : `${p.days}일`) : `${p.months}개월`);
