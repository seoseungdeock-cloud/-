// 법률 절차 안내 봇: 의뢰인이 절차를 물으면 분야별 일반 절차를 자동으로 보내 드립니다.
// 내용은 승덕 님이 정리한 안내문(2026-10-13) 그대로입니다. 개별 사건 판단은 하지 않습니다.

export type ProcedureKey = 'criminal' | 'civil' | 'divorce' | 'inheritance' | 'admin' | 'insolvency';

type Guide = { label: string; keywords: string[]; sections: { title?: string; steps: string[] }[] };

export const PROCEDURES: Record<ProcedureKey, Guide> = {
  criminal: {
    label: '형사',
    keywords: ['형사', '고소', '고발', '경찰', '검찰', '기소', '피의자', '구속', '송치', '약식', '벌금', '공판', '범죄', '성범죄', '음주운전', '교통사고', '폭행', '협박', '사기', '횡령', '모욕', '학교폭력'],
    sections: [
      {
        steps: [
          '수사 착수: 고소·신고나 인지로 경찰 수사가 시작됩니다.',
          '경찰 조사: 피의자·참고인 조사를 받습니다. 변호인이 입회할 수 있습니다. 구속 사건이면 이 사이에 구속영장실질심사가 열립니다.',
          '송치 / 불송치: 경찰이 혐의가 있다고 보면 검찰로 넘기고(송치), 없다고 보면 사건을 종결합니다(불송치). 불송치에는 고소인이 이의신청을 할 수 있습니다.',
          '검찰 조사·처분: 검찰이 보완 조사 후 처분합니다.',
          '기소: 약식기소(벌금형으로 서면 재판) 또는 정식기소(공판)',
          '불기소: 혐의없음·기소유예 등',
          '공판: 공소장을 받고 의견서를 냅니다. 이후 공판기일에 증거조사·증인신문을 거쳐 결심(구형·최후진술)까지 갑니다.',
          '선고',
          '불복: 항소는 7일 안에 하고, 항소이유서는 20일 안에 냅니다. 약식명령에는 정식재판청구를 할 수 있습니다.',
        ],
      },
    ],
  },
  civil: {
    label: '민사',
    keywords: ['민사', '소송', '소장', '손해배상', '대여금', '가압류', '가처분', '내용증명', '금전', '계약', '임대차', '보증금', '부동산', '강제집행'],
    sections: [
      {
        steps: [
          '사전 조치: 필요하면 내용증명을 보내고, 가압류·가처분으로 상대 재산을 묶어 둡니다.',
          '소장 제출: 소장을 내면 상대방에게 소장 부본이 송달됩니다.',
          '답변서: 상대방은 30일 안에 답변서를 냅니다. 답변이 없으면 변론 없이 판결이 날 수 있습니다(무변론판결).',
          '서면 공방·변론준비: 양측이 준비서면과 증거를 주고받습니다.',
          '변론기일: 증인신문, 감정 등이 진행됩니다. 중간에 조정이나 화해권고결정이 나올 수 있고, 이의는 2주 안에 합니다.',
          '변론종결 → 판결 선고',
          '항소: 판결문을 받은 날부터 2주 안에 항소하고, 항소이유서는 40일 안에 냅니다.',
          '판결 확정 → 강제집행',
        ],
      },
    ],
  },
  divorce: {
    label: '이혼',
    keywords: ['이혼', '양육', '위자료', '재산분할', '친권', '가사', '숙려'],
    sections: [
      {
        title: '협의이혼',
        steps: [
          '가정법원에 협의이혼의사확인을 신청하고 이혼 안내를 받습니다.',
          '숙려기간을 거칩니다. 미성년 자녀가 있으면 3개월, 없으면 1개월입니다.',
          '확인기일에 출석합니다.',
          '3개월 안에 이혼신고를 합니다.',
        ],
      },
      {
        title: '재판이혼',
        steps: [
          '소장 제출: 이혼, 위자료, 재산분할, 친권·양육권, 양육비를 함께 청구합니다.',
          '사전처분·보전처분: 필요하면 임시 양육자 지정이나 재산 가압류를 신청합니다.',
          '가사조사: 가사조사관이 면접조사를 합니다.',
          '조정: 성립하면 여기서 사건이 끝납니다.',
          '조정 불성립 시 변론기일 → 판결 선고',
          '항소: 2주 안에 합니다.',
          '판결 확정 후 1개월 안에 이혼신고',
        ],
      },
    ],
  },
  inheritance: {
    label: '상속',
    keywords: ['상속', '유류분', '한정승인', '상속포기', '유언', '상속세', '사망'],
    sections: [
      {
        steps: [
          '상속 개시(사망) → 상속재산 조회',
          '승인·포기 선택: 상속이 시작된 것을 안 날부터 3개월 안에 단순승인, 한정승인, 상속포기 중 하나를 정합니다.',
          '상속재산분할: 상속인끼리 협의하고, 협의가 안 되면 법원에 분할 심판을 청구합니다(조정 → 심판).',
          '유류분 반환청구: 필요한 경우에 합니다. 침해를 안 날부터 1년, 상속 개시부터 10년 안에 해야 합니다.',
          '상속세 신고: 사망한 달의 말일부터 6개월 안에 합니다.',
        ],
      },
    ],
  },
  admin: {
    label: '행정',
    keywords: ['행정', '영업정지', '면허', '운전면허', '면허취소', '징계', '행정심판', '행정소송', '소청', '처분'],
    sections: [
      {
        title: '영업정지, 면허취소, 징계 등',
        steps: [
          '처분 통지 받음',
          '집행정지 신청: 처분 효력을 일단 멈춰야 할 때 신청합니다.',
          '행정심판: 처분을 안 날부터 90일, 처분이 있은 날부터 180일 안에 청구합니다. 이후 행정심판위원회 심리를 거쳐 재결이 나옵니다.',
          '운전면허 처분은 행정심판을 먼저 거쳐야 합니다.',
          '공무원 징계는 소청심사(30일)를 먼저 거쳐야 합니다.',
          '행정소송: 안 날부터 90일, 있은 날부터 1년 안에 제기합니다. 행정법원 1심 후 항소할 수 있습니다.',
        ],
      },
    ],
  },
  insolvency: {
    label: '회생·파산',
    keywords: ['회생', '파산', '면책', '변제계획', '빚', '채무', '추심'],
    sections: [
      {
        title: '개인회생',
        steps: [
          '신청서와 변제계획안을 냅니다.',
          '법원 보정명령에 맞춰 서류를 보완합니다.',
          '금지·중지명령으로 추심과 압류가 멈춥니다.',
          '개시결정이 나옵니다.',
          '채권자집회를 거쳐 인가결정이 나옵니다.',
          '원칙적으로 3년 동안 변제합니다.',
          '면책을 받습니다.',
        ],
      },
      {
        title: '개인파산',
        steps: ['신청 후 파산선고가 나오고 파산관재인이 선임됩니다.', '채권자집회·의견청취기일이 열립니다.', '면책결정이 나옵니다.'],
      },
    ],
  },
};

/** 더 구체적인 분야부터 봅니다 (예: '이혼 소송'은 민사가 아니라 이혼). */
const ORDER: ProcedureKey[] = ['divorce', 'inheritance', 'insolvency', 'admin', 'criminal', 'civil'];

const ASKS_PROCEDURE = /절차|과정|순서|단계|어떻게\s*(진행|되나|돼|해야|하나)|진행\s*(방법|순서)|뭘\s*해야|무엇을\s*해야/;

export function asksProcedure(text: string): boolean {
  return ASKS_PROCEDURE.test(text);
}

export function detectProcedure(text: string): ProcedureKey | undefined {
  return ORDER.find((k) => PROCEDURES[k].keywords.some((w) => text.includes(w)));
}

export function procedureText(key: ProcedureKey): string {
  const g = PROCEDURES[key];
  const lines = [`[${g.label} 절차 안내]`];
  for (const sec of g.sections) {
    if (sec.title) lines.push('', `■ ${sec.title}`);
    sec.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  lines.push('', '사건마다 기간과 대응이 다를 수 있으니 구체적인 내용은 변호사와 확인하세요.');
  return lines.join('\n');
}

export const PROCEDURE_MENU =
  '어떤 절차가 궁금하신가요? 형사, 민사, 이혼, 상속, 행정, 회생·파산 중에서 "이혼 절차"처럼 적어 주시면 순서대로 안내해 드립니다.';

/**
 * 의뢰인 메시지에 대한 절차 안내. 절차 질문이 아니면 undefined.
 * 메시지에 분야가 없으면 사건 분야(fallbackField)로, 그것도 없으면 분야를 묻습니다.
 */
export function procedureReply(text: string, fallbackField?: string): string | undefined {
  if (!asksProcedure(text)) return undefined;
  const key = detectProcedure(text) ?? (fallbackField ? detectProcedure(fallbackField) : undefined);
  return key ? procedureText(key) : PROCEDURE_MENU;
}
