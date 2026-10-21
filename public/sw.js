// 대륜톡 서비스 워커: PC·폰 브라우저 '앱 설치'와 웹 알림(푸시)을 맡습니다. 화면 파일은 캐시하지 않고 항상 최신판을 받습니다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

const base = new URL(self.registration.scope).pathname; // 예: /-/

self.addEventListener('push', (e) => {
  let msg = {};
  try {
    msg = e.data ? e.data.json() : {};
  } catch {
    msg = { title: '대륜톡', body: e.data ? e.data.text() : '' };
  }
  const data = msg.data || {};
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // 앱 창을 보고 있으면 새 메시지는 화면에 바로 들어오므로 띄우지 않습니다 (기일 알림은 항상 띄움)
      if (data.kind === 'message' && wins.some((w) => w.focused && w.visibilityState === 'visible')) return;
      return self.registration.showNotification(msg.title || '대륜톡', {
        body: msg.body || '',
        icon: base + 'icon-maskable-192.png',
        badge: base + 'icon-192.png',
        tag: data.roomId ? 'room-' + data.roomId : undefined,
        renotify: !!data.roomId,
        requireInteraction: data.kind === 'hearing' || data.kind === 'deadline',
        data,
      });
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const roomId = (e.notification.data || {}).roomId;
  const target = new URL(roomId ? base + 'room/' + roomId : base, self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).pathname.startsWith(base));
      if (win) return win.focus().then((w) => (w && 'navigate' in w ? w.navigate(target) : undefined));
      return self.clients.openWindow(target);
    }),
  );
});
