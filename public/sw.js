// PC·폰 브라우저에서 '앱 설치'가 되도록 하는 최소 서비스 워커. 화면은 항상 서버의 최신판을 받습니다(캐시 안 함).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
