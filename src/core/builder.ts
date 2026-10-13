// 경영 에이전트 ④ 필요한 프로그램을 말로 요청하면 만들어 주는 기능
// AI가 연결되면 코딩 에이전트가 격리된 환경(샌드박스)에서 소형 내부 도구를 만듭니다.

export type ProgramRequest = {
  id: string;
  title: string;
  description: string;
  requestedBy: string;
  at: string;
  status: 'AI 연결 대기' | '생성 중' | '검수 필요' | '사용 중';
};

export function titleFrom(description: string): string {
  const first = description.trim().split(/[.\n]/)[0];
  return first.length > 24 ? `${first.slice(0, 24)}…` : first || '새 프로그램';
}
