import { EmptyPane, MessengerList, MessengerSplit } from '@/ui/messenger-list';
import { useLayout } from '@/ui/web-frame';

// 대화 탭. 모바일·태블릿은 목록만, 데스크톱은 왼쪽 목록 + 오른쪽 안내(대화방을 고르면 room/[id] 가 같은 2단 구성으로 열림)
export default function MessengerScreen() {
  const { split } = useLayout();
  if (!split) return <MessengerList />;
  return (
    <MessengerSplit>
      <EmptyPane />
    </MessengerSplit>
  );
}
