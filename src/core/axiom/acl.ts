// 공개 등급 4단계. "에이전트와 매뉴얼은 전사 공개, 결과물·대화는 등급 상속"이 기본 원칙.
//   org           전사 공개
//   team:<키>     해당 팀 구성원 (+관리자)
//   case:<번호>   해당 사건 배정 인원 (+관리자)  — 의뢰인 비밀·정보차단벽
//   confidential  관리자만  — 인사·민감 경영정보
// 라잇나우판은 사건 배정·개별 허가 화면이 아직 없어서, 사건·기밀 등급은 관리자어드민만 봅니다.
import type { Where } from './db';
import type { AxUser, Instance } from './types';
import { AxError } from './util';

export const LEVEL = { org: 0, team: 1, case: 2, confidential: 3 } as const;
type Level = keyof typeof LEVEL;

export function parse(v: unknown): { level: Level; key: string | null } {
  const s = String(v || 'org');
  if (s === 'org' || s === 'confidential') return { level: s, key: null };
  const m = s.match(/^(team|case):(.+)$/);
  if (m) return { level: m[1] as Level, key: m[2] };
  return { level: 'confidential', key: null }; // 알 수 없는 값은 가장 엄격하게
}

export function normalize(v: unknown, inst: Instance): string {
  const p = parse(v);
  if (p.level === 'team' && !(inst.teams || []).some((t) => t.key === p.key)) throw new AxError(400, `없는 팀입니다: ${p.key}`);
  if (p.level === 'case' && !/^[\w\-가-힣.()]{1,60}$/.test(p.key ?? '')) throw new AxError(400, '사건 번호 형식이 올바르지 않습니다.');
  return p.key ? `${p.level}:${p.key}` : p.level;
}

export function canSee(user: AxUser | null, visibility: unknown): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const p = parse(visibility);
  if (p.level === 'org') return true;
  if (p.level === 'team') return user.teams.includes(p.key ?? '');
  return false;
}

export function assertSee(user: AxUser, visibility: unknown) {
  if (!canSee(user, visibility)) throw new AxError(403, '열람 권한이 없는 자료입니다.');
}

/** 목록 조회 조건 */
export function filter(user: AxUser): Where {
  if (user.role === 'admin') return {};
  return { in: { visibility: ['org', ...user.teams.map((t) => `team:${t}`)] } };
}

// 여러 입력에서 만든 결과물은 가장 엄격한 등급을 물려받는다.
// 같은 단계라도 서로 다른 팀/사건이 섞이면 '기밀'로 올린다.
export function inherit(...vs: (string | null | undefined)[]): string {
  const ps = vs.filter(Boolean).map(parse);
  if (!ps.length) return 'org';
  const max = Math.max(...ps.map((p) => LEVEL[p.level]));
  const top = ps.filter((p) => LEVEL[p.level] === max);
  const keys = new Set(top.map((p) => p.key));
  const lvl = (Object.keys(LEVEL) as Level[]).find((k) => LEVEL[k] === max)!;
  if (keys.size > 1) return 'confidential';
  const k = [...keys][0];
  return k ? `${lvl}:${k}` : lvl;
}

export function label(v: unknown, inst: Instance): string {
  const p = parse(v);
  if (p.level === 'org') return '전사 공개';
  if (p.level === 'confidential') return '기밀';
  if (p.level === 'team') {
    const t = (inst.teams || []).find((x) => x.key === p.key);
    return `${t ? t.label : p.key} 팀`;
  }
  return `사건 ${p.key}`;
}
