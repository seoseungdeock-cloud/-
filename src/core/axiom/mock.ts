// 모의 응답 — AI 키 없이 화면과 흐름을 시험하기 위한 결정적(항상 같은) 응답.
// 실제 판단이 아니므로 모든 결과에 [모의 응답] 표시가 붙는다.
import { addDays, kstDate, num } from './util';

export const TAG = '[모의 응답]';

type Input = Record<string, any>;

function metric(state: Input | undefined, re: RegExp) {
  const m = (state?.metrics || []).find((x: Input) => re.test(x.name) && num(x.value) != null);
  return m ? num(m.value) : null;
}

function sentences(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    cur += ch;
    if (/[.!?다요]/.test(ch)) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out;
}

function agendaFrom(text: unknown) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  let items = lines
    .filter((l) => /^(\d+[.)]|[-*•·]|안건|\[안건)/.test(l))
    .map((l) => l.replace(/^(\d+[.)]|[-*•·]|안건\s*\d*[:.)]?|\[안건[^\]]*\])\s*/, '').trim())
    .filter((l) => l.length > 3);
  if (!items.length) items = sentences(String(text || '')).filter((s) => s.trim().length > 8).map((s) => s.trim()).slice(0, 3);
  if (!items.length) items = ['회의 전반 방향 점검'];
  return items.slice(0, 4).map((t, i) => ({ id: `A${i + 1}`, title: t.slice(0, 60), background: `${TAG} 회의록에서 추출한 안건: ${t.slice(0, 120)}` }));
}

function strategies(input: Input, revised: boolean) {
  const st = input.company_state || {};
  const rev = metric(st, /매출/);
  const mk = metric(st, /마케팅/) || (rev ? Math.round(rev * 0.05) : null);
  const today = kstDate();
  const base = (r: number | null, g: number) => (r == null ? null : Math.round(r * g));
  const list = [
    { name: '전문분야 집중형', g: [1.02, 1.07, 1.13], c: 1.0, sum: '수임 단가가 높은 전문분야에 마케팅·인력을 집중' },
    { name: '채널 확장형', g: [0.99, 1.05, 1.15], c: 1.6, sum: '블로그·검색·AI 답변 노출 채널을 넓혀 유입 확대' },
    { name: '원가 효율형', g: [1.0, 1.03, 1.06], c: 0.6, sum: '반복 업무 자동화로 원가를 낮추고 이익률 개선' },
  ];
  return list.map((s) => ({
    name: s.name,
    summary: `${TAG} ${s.sum}${revised ? ' (검증 지적 반영)' : ''}`,
    team_actions: {
      marketing: [`${s.name} 메시지로 키워드 30개 재편`, '분야별 상담 전환율 측정 체계 구축'],
      development: ['AXIOM 대시보드에 분야별 매출·유입 지표 연결'],
      management: ['분야별 손익을 월 단위로 공유'],
      hr: s.name === '전문분야 집중형' ? ['해당 분야 경력 변호사 수요 검토(참고자료)'] : [],
      legal: ['광고 문구 변협 규정 사전 검토'],
    },
    cost: { total: mk != null ? Math.round(mk * s.c * 3) : null, unit: '원', breakdown: mk != null ? [{ item: '마케팅 집행(3개월)', amount: Math.round(mk * s.c * 3) }] : [] },
    revenue: { metric: '월 매출', unit: '원', horizon: '3개월 후', conservative: base(rev, s.g[0]), base: base(rev, revised ? s.g[1] - 0.01 : s.g[1]), optimistic: base(rev, s.g[2]) },
    assumptions: [
      { text: '현재 상담 전환율이 유지된다', if_wrong: '전환율이 20% 떨어지면 기준 시나리오 매출 증가분이 사라진다' },
      { text: '광고 규정 검토로 집행이 지연되지 않는다', if_wrong: '1개월 지연 시 효과 발생도 1개월 늦어진다' },
    ],
    risks: ['경쟁 법인의 동일 키워드 집중', '담당 변호사 업무 과부하'],
    check_date: addDays(today, 90),
  }));
}

export function respond({ role, mode, input = {}, agentName }: { role?: string; mode: string; input?: any; agentName: string }): unknown {
  switch (`${role}:${mode}`) {
    case 'secretary:agenda': {
      const agenda = agendaFrom(input.meeting?.text);
      return {
        summary: `${TAG} 회의에서 ${agenda.length}개 안건이 논의되었습니다.`,
        decisions_made: ['다음 회의 전까지 분야별 실적 자료 공유'],
        agenda,
        action_items: [{ owner: '경영지원', task: '분야별 매출 자료 정리', due: addDays(kstDate(), 7) }],
      };
    }
    case 'secretary:minutes':
      return `## 회의록 (정리본)\n\n${TAG}\n\n### 안건\n${agendaFrom(input.text || input)
        .map((a) => `- ${a.title}`)
        .join('\n')}\n\n### 결정 사항\n- (정리 필요)\n\n### 할 일\n- (정리 필요)`;
    case 'critic:debate':
      return {
        stance: '비판',
        summary: `${TAG} "${input.agenda_item?.title}"은 근거 데이터가 부족합니다.`,
        points: [
          { claim: '기대 효과를 뒷받침할 실적 데이터가 회의록에 없다', basis: '회사 상태 시트에 해당 분야 수치 없음' },
          { claim: '실행 인력의 업무 부담이 고려되지 않았다', basis: '담당자·기한 미정' },
        ],
        risks: ['비용 대비 효과 불확실', '광고 규정 위반 소지 검토 필요'],
        questions: ['성과를 무엇으로 측정할 것인가?', '중단 기준은 무엇인가?'],
      };
    case 'advocate:debate':
      return {
        stance: '옹호',
        summary: `${TAG} "${input.agenda_item?.title}"은 성장 기회가 분명합니다.`,
        points: [
          { claim: '경쟁 법인 대비 선점 효과가 있다', basis: '현재 시장에서 해당 메시지를 쓰는 곳이 적음' },
          { claim: '기존 시스템(자동 콘텐츠 생성)을 재활용해 추가 비용이 작다', basis: '이미 구축된 파이프라인' },
        ],
        upside: ['신규 상담 유입 증가', '브랜드 전문성 강화'],
        conditions: ['3개월 단위 성과 점검'],
      };
    case 'judge:direction': {
      const items = input.items || [];
      return {
        overall_direction: `${TAG} 데이터로 검증 가능한 안건부터 조건부 추진`,
        directions: items.map((it: Input, i: number) => ({
          agenda_id: it.agenda?.id || `A${i + 1}`,
          title: it.agenda?.title || '',
          decision: i === items.length - 1 && items.length > 2 ? '부' : i === 0 ? '가' : '수정',
          direction: i === 0 ? '추진하되 성과 지표를 먼저 정한다' : '범위를 줄여 시범 운영',
          rationale: '옹호 측 기회는 분명하나 비판 측 지적대로 측정 체계가 선행돼야 함',
          conditions: ['성과 지표 사전 확정', '광고 문구 사전 검토'],
        })),
      };
    }
    case 'forecaster:propose': {
      const s = strategies(input, false);
      return { data_gaps: s[0].revenue.base == null ? ['월 매출 실적', '분야별 매출', '마케팅 비용'] : [], strategies: s };
    }
    case 'forecaster:revise': {
      const s = strategies(input, true);
      return { data_gaps: s[0].revenue.base == null ? ['월 매출 실적'] : [], strategies: s, changes: s.map((x) => ({ strategy: x.name, change: '기준 시나리오를 1%p 보수적으로 조정' })) };
    }
    case 'critic:verify': {
      const names: string[] = (input.strategies || []).map((s: Input) => s.name);
      return {
        overall: `${TAG} 전환율 가정이 가장 취약합니다.`,
        challenges: names.map((n) => ({ strategy: n, target: '현재 상담 전환율이 유지된다', issue: '채널이 바뀌면 전환율도 바뀐다. 과거 실적 근거 필요', severity: '중' })),
        compliance: names.slice(0, 1).map((n) => ({ strategy: n, issue: '전문분야 표방 문구는 광고규정상 표시 요건 확인 필요', basis: '변호사 광고에 관한 규정', severity: '중' })),
        missing_data: ['채널별 상담 전환율'],
      };
    }
    case 'judge:final': {
      const s = input.strategies || [];
      const pick = s[0]?.name || '전략 없음';
      return {
        recommended: pick,
        summary: `${TAG} "${pick}"을 조건부로 추천합니다.`,
        rationale: '비용 대비 기대 매출이 가장 안정적이고, 검증 지적(전환율)을 측정 체계로 보완 가능',
        why_not_others: s.slice(1).map((x: Input) => ({ name: x.name, reason: '불확실성 대비 비용이 큼' })),
        conditions: ['채널별 전환율 측정 후 1개월 차 재점검'],
        decisions_needed: [{ question: '마케팅 예산 증액을 승인할까요?', options: ['승인', '50%만 승인', '보류'], recommendation: '50%만 승인' }],
      };
    }
    case 'planner:plan': {
      const ta = input.strategy?.team_actions || {};
      const teams = (input.teams || []).map((t: Input) => t.key);
      const out = [];
      for (const [team, acts] of Object.entries(ta)) {
        if (!teams.includes(team)) continue;
        for (const a of ((acts as string[]) || []).slice(0, 2))
          out.push({ team, title: String(a).slice(0, 80), detail: `${TAG} ${a}`, deliverable: '실행 계획서', due: addDays(kstDate(), 14) });
      }
      return { work_orders: out };
    }
    case 'reporter:report':
      return {
        summary: `${TAG} 기간 중 활동 ${(input.activity?.runs || []).length}건`,
        done: (input.activity?.work_orders || []).filter((w: Input) => w.status === 'done').map((w: Input) => w.title),
        in_progress: (input.activity?.work_orders || []).filter((w: Input) => w.status !== 'done').map((w: Input) => w.title),
        decisions_needed: (input.activity?.pending_approvals || [])
          .slice(0, 3)
          .map((a: Input) => ({ question: `"${a.title}" 결재가 대기 중입니다`, options: ['승인', '수정 요구'], recommendation: '검토 후 결정' })),
        risks: [],
      };
    default:
      if (mode === 'execute') {
        const wo = input.work_order || {};
        return {
          title: `${wo.title || '작업'} — 결과물`,
          deliverable_markdown: `## ${wo.title || '작업'}\n\n${TAG} ${agentName}이 작성한 초안입니다.\n\n### 목표\n${wo.detail || ''}\n\n### 실행 계획\n1. 현황 파악\n2. 실행안 작성\n3. 성과 지표 설정\n\n${input.feedback ? `### 반영한 수정 요구\n- ${input.feedback}\n` : ''}`,
          cost_estimate: null,
          next_steps: ['담당자 검토'],
          decisions_needed: [],
          external_actions: [],
        };
      }
      return `${TAG} ${agentName}입니다. 실제 AI 키가 연결되면 이 자리에 답변이 표시됩니다.\n\n받은 내용: ${typeof input === 'string' ? input.slice(0, 200) : JSON.stringify(input).slice(0, 200)}`;
  }
}
