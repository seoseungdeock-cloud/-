// AXIOM 대륜 인스턴스 설정 (AXIOM v0.1 instances/daeryun 그대로). 조직 고유의 것은 이 파일에만 둡니다.
// 이 설정·대원칙·점검 규칙과, 이를 써서 쌓인 자료는 대륜 소유입니다 (AXIOM LICENSE 2항).
import type { Instance } from './types';

export const PRINCIPLES = "### 법무법인(유한) 대륜 — AXIOM 대원칙 (모든 에이전트 공통)\n※ 초안입니다. 대표변호사가 직접 보완·확정해야 합니다.\n\n**1. 법령·직업윤리**\n- 사건의 소개·알선·유인 대가를 주거나 받는 구조, 변호사 아닌 자와 보수를 나누는 구조를 전제로 한 전략을 제안하지 않는다(변호사법 제34조).\n- 형사사건 성공보수 약정을 전제로 한 매출 전략을 제안하지 않는다(대법원 2015. 7. 23. 선고 2015다200111 전원합의체 판결).\n- 광고·홍보는 변호사법 제23조와 대한변호사협회 「변호사 광고에 관한 규정」 안에서만 한다. 결과 보장, 객관적 근거 없는 최고·1위 표현, 다른 변호사·법인 비방이나 근거 없는 비교를 쓰지 않는다.\n- 의뢰인 비밀은 사건 등급 밖으로 옮기지 않는다(변호사법 제26조). 이해충돌(변호사법 제31조) 가능성이 보이면 반드시 표시한다.\n\n**2. 사람에 대한 판단**\n- 채용·평가·징계·해고·배치 등 사람에 대한 결정은 AI가 내리지 않는다. 선택지와 근거를 제시하고 최종 결정은 사람이 한다.\n- 건강·가족·종교·정치 성향 등 민감정보와 사생활을 평가에 쓰지 않는다.\n\n**3. 숫자와 사실**\n- 입력 자료에 없는 수치·사실·판례를 만들지 않는다. 추정은 '추정'이라고 쓰고 근거를 붙인다.\n- 판례·법령은 확인 가능한 것만 인용하고, 불확실하면 '확인 필요'로 표시한다.\n\n**4. 실행과 보안**\n- 외부로 나가는 행위(발행·발송·광고 집행·배포·채용 공고)는 직접 하지 않고 승인 요청으로 올린다.\n- 주민등록번호·계좌·카드번호·API 키 같은 정보는 결과물에 넣지 않는다.\n";

export const GUARDRAILS: Instance['guardrails'] = [
  {
    "id": "pii-rrn",
    "pattern": "\\b\\d{6}\\s?-\\s?[1-4]\\d{6}\\b",
    "label": "주민등록번호로 보이는 값",
    "basis": "개인정보보호법 — 고유식별정보 처리 제한",
    "severity": "상",
    "mask": true
  },
  {
    "id": "pii-card",
    "pattern": "\\b(?:\\d{4}[- ]){3}\\d{4}\\b",
    "label": "카드번호로 보이는 값",
    "basis": "금융정보 노출",
    "severity": "상",
    "mask": true
  },
  {
    "id": "secret-key",
    "pattern": "\\b(sk-[A-Za-z0-9_\\-]{16,}|AIza[0-9A-Za-z_\\-]{20,})",
    "label": "API 키로 보이는 값",
    "basis": "보안 — 키 노출",
    "severity": "상",
    "mask": true
  },
  {
    "id": "auto-decision",
    "pattern": "(자동|즉시)\\s?(해고|해임|징계|감봉|채용\\s?탈락|불합격)",
    "label": "사람 개입 없는 인사 결정 표현",
    "basis": "AI 기본법(고영향 AI 판단 기준: 사람의 최종 판단) · 개인정보보호법 제37조의2(자동화된 결정)",
    "severity": "상"
  },
  {
    "id": "law-34-referral",
    "pattern": "(소개|알선|유인)\\s?(료|비|수수료|대가|리베이트)|사건\\s?(소개|알선)\\s?(제휴|수수료)|브로커",
    "label": "사건 소개·알선 대가 관련 표현",
    "basis": "변호사법 제34조",
    "severity": "상"
  },
  {
    "id": "law-34-fee-split",
    "pattern": "(비변호사|제휴사|플랫폼|대행사).{0,20}(수익|보수|수임료)\\s?(배분|분배|공유|정산)|(수익|보수|수임료)\\s?(배분|분배).{0,20}(비변호사|제휴사|플랫폼|대행사)",
    "label": "비변호사와 보수·수익 분배 구조",
    "basis": "변호사법 제34조",
    "severity": "상"
  },
  {
    "id": "criminal-success-fee",
    "pattern": "(형사|구속|보석|불기소|무죄|집행유예|감형).{0,40}성공\\s?보수|성공\\s?보수.{0,40}(형사|구속|보석|불기소|무죄|집행유예|감형)",
    "label": "형사사건 성공보수",
    "basis": "대법원 2015. 7. 23. 선고 2015다200111 전원합의체 판결",
    "severity": "상"
  },
  {
    "id": "ad-superlative",
    "pattern": "(업계|국내|최고|최초|유일|넘버원|No\\.?\\s?1|1위)\\s?(의|인)?\\s?(로펌|법무법인|변호사|승소)|승소율\\s?\\d|100\\s?%\\s?(승소|해결|보장)|무조건\\s?(승소|해결|무죄)|결과\\s?보장",
    "label": "과장·결과 보장 광고 표현",
    "basis": "변호사법 제23조 · 변호사 광고에 관한 규정",
    "severity": "중"
  },
  {
    "id": "ad-fee-bait",
    "pattern": "(수임료|선임료|착수금)\\s?(할인|파격|최저|무료|0원)|무료\\s?(선임|수임)",
    "label": "수임료 관련 광고 표현",
    "basis": "변호사 광고에 관한 규정(수임료 표시 관련 제한 확인)",
    "severity": "중"
  },
  {
    "id": "ad-compare",
    "pattern": "(타|경쟁|다른)\\s?(법인|로펌|변호사|사무소).{0,25}(보다|대비|비교|못한|부족)",
    "label": "다른 변호사·법인과의 비교 표현",
    "basis": "변호사법 제23조 · 변호사 광고에 관한 규정(비교·비방 광고)",
    "severity": "중"
  }
];

const RAW = {
  "name": "법무법인(유한) 대륜",
  "brand": {
    "org_label": "법무법인(유한) 대륜",
    "product": "AXIOM",
    "color": "#AE0E36",
    "logo": null
  },
  "timezone": "Asia/Seoul",
  "default_visibility": "org",
  "teams": [
    {
      "key": "management",
      "label": "경영",
      "agent": "management"
    },
    {
      "key": "marketing",
      "label": "마케팅",
      "agent": "marketing"
    },
    {
      "key": "development",
      "label": "개발",
      "agent": "development"
    },
    {
      "key": "hr",
      "label": "인사",
      "agent": "hr"
    },
    {
      "key": "legal",
      "label": "변호사 업무",
      "agent": "legal-ops"
    }
  ],
  "sensitive_teams": [
    "hr"
  ],
  "approval_policy": {
    "council_final": "pre",
    "work_order:management": "post",
    "work_order:marketing": "post",
    "work_order:development": "post",
    "work_order:hr": "pre",
    "work_order:legal": "post",
    "report": "post",
    "external_action": "pre"
  },
  "models": {
    "tiers": {
      "anthropic": {
        "economy": "claude-haiku-5-5",
        "balanced": "claude-sonnet-5-5",
        "best": "claude-opus-5-5"
      },
      "openai": {
        "economy": "",
        "balanced": "",
        "best": ""
      },
      "gemini": {
        "economy": "gemini-3.6-flash",
        "balanced": "gemini-3.6-flash",
        "best": ""
      }
    },
    "fallback_order": [
      "anthropic",
      "openai",
      "gemini"
    ],
    "prices": {},
    "concurrency": 4
  },
  "budget": {
    "monthly_usd": null
  },
  "council": {
    "max_agenda": 5,
    "strategies": 3,
    "max_work_orders": 12,
    "default_visibility": "team:management",
    "state_template": "항목,값,단위\n월 매출,,원\n분야별 매출 — 형사,,원\n분야별 매출 — 민사·가사,,원\n분야별 매출 — 기업자문,,원\n월 신규 수임 건수,,건\n평균 수임 단가,,원\n월 상담 건수,,건\n상담→수임 전환율,,%\n월 마케팅 비용,,원\n채널별 상담 유입(블로그/검색/소개 등),,\n월 인건비,,원\n변호사 수,,명\n직원 수,,명"
  },
  "messenger": {
    "approval_channel": null,
    "channel_visibility": {}
  }
};

export const INSTANCE: Instance = { ...RAW, key: 'daeryun', principles: PRINCIPLES, guardrails: GUARDRAILS } as Instance;
