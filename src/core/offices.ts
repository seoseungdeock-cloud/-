import raw from '../data/offices.json';
import { KOREA_REGIONS } from '../data/korea-map';

export type Lawyer = {
  id: string;
  name: string;
  fields: string[];
  careerYears: number;
  consultFee: number;
  intro: string;
};

export type Office = {
  id: string;
  name: string;
  regionCode: string;
  address: string;
  phone: string;
  lat?: number;
  lon?: number;
  sample?: boolean;
  lawyers: Lawyer[];
};

export const OFFICES: Office[] = (raw as { offices: Office[] }).offices;

export function regionName(code: string): string {
  return KOREA_REGIONS.find((r) => r.code === code)?.name ?? code;
}

export function officeCountByRegion(offices: Office[] = OFFICES): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of offices) out[o.regionCode] = (out[o.regionCode] ?? 0) + 1;
  return out;
}

export function allFields(offices: Office[] = OFFICES): string[] {
  return [...new Set(offices.flatMap((o) => o.lawyers.flatMap((l) => l.fields)))].sort();
}

export type LawyerFilter = {
  regionCode?: string;
  field?: string;
  keyword?: string;
  sort: 'career' | 'name' | 'consultFee';
};

export type LawyerRow = Lawyer & { office: Office };

export function searchLawyers(filter: LawyerFilter, offices: Office[] = OFFICES): LawyerRow[] {
  const kw = filter.keyword?.trim();
  const rows: LawyerRow[] = [];
  for (const office of offices) {
    if (filter.regionCode && office.regionCode !== filter.regionCode) continue;
    for (const l of office.lawyers) {
      if (filter.field && !l.fields.includes(filter.field)) continue;
      if (kw && ![l.name, l.intro, office.name, ...l.fields].some((t) => t.includes(kw))) continue;
      rows.push({ ...l, office });
    }
  }
  const cmp: Record<LawyerFilter['sort'], (a: LawyerRow, b: LawyerRow) => number> = {
    career: (a, b) => b.careerYears - a.careerYears,
    name: (a, b) => a.name.localeCompare(b.name, 'ko'),
    consultFee: (a, b) => a.consultFee - b.consultFee,
  };
  return rows.sort(cmp[filter.sort]);
}

export function findLawyer(id: string, offices: Office[] = OFFICES): LawyerRow | undefined {
  for (const office of offices) {
    const l = office.lawyers.find((x) => x.id === id);
    if (l) return { ...l, office };
  }
  return undefined;
}

export function formatFee(won: number): string {
  return won === 0 ? '무료 상담' : `상담료 ${won.toLocaleString('ko-KR')}원`;
}
