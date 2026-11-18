// 없는 주소(예: 지운 옛 화면 /home, /find, /membership 을 북마크·탭에 남겨 둔 경우)는 첫 화면으로 보냅니다.
// 로그인 전이면 로그인 화면으로 — 보호된 주소('/')로 바로 보내면 라우터가 멈춰 빈 화면이 됩니다.
import { Redirect } from 'expo-router';

import { loggedIn } from '@/core/store';
import { useApp } from '@/ui/use-app';

export default function NotFound() {
  const app = useApp();
  return <Redirect href={loggedIn(app) ? '/' : '/login'} />;
}
