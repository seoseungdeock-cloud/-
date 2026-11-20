// 웹 화면과 PC 앱 사이의 다리. 웹에서는 window.skynetDesktop 으로 보입니다 (없으면 브라우저에서 돌고 있는 것).
const { contextBridge, ipcRenderer } = require('electron');

/** Windows 작업표시줄 덧아이콘용: 빨간 원 안에 숫자 (16x16은 흐려서 32x32 로 그림) */
function badgeImage(n) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#E5484D';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  const text = n > 99 ? '99+' : String(n);
  ctx.font = `bold ${text.length > 2 ? 13 : 18}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 1);
  return canvas.toDataURL('image/png');
}

const openRoomHandlers = new Set();
ipcRenderer.on('open-room', (_e, roomId) => openRoomHandlers.forEach((fn) => fn(roomId)));

contextBridge.exposeInMainWorld('skynetDesktop', {
  platform: process.platform,
  /** 안 읽은 메시지 수 → Dock/작업표시줄 배지, 트레이 설명 */
  setBadge(count) {
    const n = Math.max(0, Number(count) || 0);
    ipcRenderer.send('badge', { count: n, dataUrl: n && process.platform === 'win32' ? badgeImage(n) : undefined });
  },
  /** 운영체제 알림. 창을 보고 있으면 PC 앱이 알아서 생략합니다 */
  notify(opts) { ipcRenderer.send('notify', opts || {}); },
  /** 알림을 눌렀을 때 열 방 — 웹이 등록 */
  onOpenRoom(fn) { openRoomHandlers.add(fn); return () => openRoomHandlers.delete(fn); },
  focus() { ipcRenderer.send('focus'); },
  info() { return ipcRenderer.invoke('desktop-info'); },
});
