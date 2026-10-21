// 대륜 아너스(멤버십): 의뢰인이 대접받는 느낌을 주는 혜택

export type Benefit = { title: string; detail: string };

export const MEMBERSHIP_BENEFITS: Benefit[] = [
  { title: '사건 진행 리포트', detail: '진행 상황이 바뀔 때마다 한눈에 보는 리포트를 받습니다.' },
  { title: '기일·마감 알림', detail: '재판 기일과 서류 마감을 놓치지 않게 미리 알려 드립니다.' },
  { title: '내 서류 보관함', detail: '사건 서류를 한 곳에 안전하게 보관합니다.' },
  { title: '이용 안내 전담 창구', detail: '앱 이용·서류 준비 방법을 전담 창구에서 바로 안내합니다.' },
  { title: '멤버 전용 화면', detail: '멤버 배지와 전용 디자인으로 표시됩니다.' },
];
