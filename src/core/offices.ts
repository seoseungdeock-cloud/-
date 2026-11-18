// 사무소·담당 변호사 목록. 백오피스(계정 발급 시 사무소 선택)와 사건방 배당 안내(담당 변호사·사무소 연락처)에 씁니다.
import raw from '../data/offices.json';

export type Lawyer = { id: string; name: string; fields: string[] };
export type Office = { id: string; name: string; address: string; phone: string; sample?: boolean; lawyers: Lawyer[] };

export const OFFICES: Office[] = (raw as { offices: Office[] }).offices;

export type LawyerRow = Lawyer & { office: Office };

export function findLawyer(id: string, offices: Office[] = OFFICES): LawyerRow | undefined {
  for (const office of offices) {
    const l = office.lawyers.find((x) => x.id === id);
    if (l) return { ...l, office };
  }
  return undefined;
}
