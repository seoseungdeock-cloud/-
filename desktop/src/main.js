// SKYNET PC 앱 — 껍데기(Electron). 화면은 배포된 웹(SKYNET_URL)을 그대로 띄우고,
// 여기서는 PC 앱만 할 수 있는 일을 맡습니다: 트레이 아이콘, 안 읽은 수 배지, 운영체제 알림, 부팅 시 자동 실행,
// 창을 닫아도 뒤에서 대기, 중복 실행 방지, 외부 링크는 기본 브라우저로.
// 웹 쪽과는 preload.js 가 만든 window.skynetDesktop 으로 이야기합니다 (src/core/desktop.ts 참고).
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification, session, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_URL = 'https://seoseungdeock-cloud.github.io/-/';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// ---- 설정 (사용자 데이터 폴더의 config.json, 환경변수 SKYNET_URL 이 우선) ----
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}
const config = readConfig();
const APP_URL = process.env.SKYNET_URL || config.url || DEFAULT_URL;
const sameOrigin = (u) => { try { return new URL(u).origin === new URL(APP_URL).origin; } catch { return false; } };

// ---- 중복 실행 방지: 두 번째로 켜면 기존 창을 앞으로 ----
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => showWindow());
}
app.setAppUserModelId('net.skyzkorea.skynet'); // Windows 알림·작업표시줄 묶음용

let win = null;
let tray = null;
let quitting = false;
let unread = 0;

const icon = (name) => nativeImage.createFromPath(path.join(__dirname, '..', 'build', name));

function createWindow() {
  const bounds = config.bounds || { width: 1280, height: 820 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 420,
    minHeight: 600,
    title: 'SKYNET',
    icon: isWin ? icon('icon.png') : undefined,
    backgroundColor: '#FFFFFF',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => { if (!config.startHidden) win.show(); });
  win.loadURL(APP_URL);

  // 로드 실패(인터넷 끊김 등) → 간단한 안내 화면, 몇 초 뒤 다시 시도
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3: 사용자가 이동을 취소한 것
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: APP_URL, reason: desc } });
  });
  // 새 창·외부 링크: 우리 주소면 같은 창에서, 아니면 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url)) { win.loadURL(url); return { action: 'deny' }; }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (sameOrigin(url) || url.startsWith('file:')) return;
    e.preventDefault();
    void shell.openExternal(url);
  });
  // 닫기 = 숨기기 (트레이에서 대기). 진짜 종료는 트레이 메뉴 「종료」또는 Cmd+Q
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    if (isMac) app.hide(); else win.hide();
  });
  const saveBounds = () => { if (win && !win.isMinimized() && !win.isFullScreen()) writeConfig({ bounds: win.getBounds() }); };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  // 페이지 제목이 바뀌어도 앱 이름 유지
  win.on('page-title-updated', (e) => e.preventDefault());
  // 개발용: SKYNET_SHOT=경로 로 켜면 7초 뒤 화면을 그 파일로 저장하고 다리(window.skynetDesktop) 유무를 로그에 적음
  if (process.env.SKYNET_SHOT) {
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SKYNET_SHOT, img.toPNG());
      console.log('shot saved', process.env.SKYNET_SHOT, 'bridge:', await win.webContents.executeJavaScript('typeof window.skynetDesktop'));
    }, 7000);
  }
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (isMac) app.show();
}

// ---- 트레이 ----
function trayMenu() {
  const auto = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: unread ? `SKYNET — 안 읽은 메시지 ${unread}` : 'SKYNET', enabled: false },
    { type: 'separator' },
    { label: '열기', click: showWindow },
    { label: '로그인 시 자동 실행', type: 'checkbox', checked: auto, click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }) },
    { label: '시작할 때 창 숨기기', type: 'checkbox', checked: !!config.startHidden, click: (item) => { config.startHidden = item.checked; writeConfig({ startHidden: item.checked }); } },
    { type: 'separator' },
    { label: '새로 고침', click: () => win?.webContents.reloadIgnoringCache() },
    { label: '서버 주소 바꾸기…', click: changeUrl },
    { type: 'separator' },
    { label: `버전 ${app.getVersion()}`, enabled: false },
    { label: '종료', click: () => { quitting = true; app.quit(); } },
  ]);
}
function createTray() {
  const img = isMac ? icon('trayTemplate.png') : icon('tray.png');
  tray = new Tray(img);
  tray.setToolTip('SKYNET');
  tray.setContextMenu(trayMenu());
  tray.on('click', () => (isWin ? showWindow() : tray.popUpContextMenu()));
  tray.on('double-click', showWindow);
}
async function changeUrl() {
  // Electron 에는 입력 대화상자가 없어 안내 + 설정 파일 열기로 대신합니다
  const r = await dialog.showMessageBox({
    type: 'question', buttons: ['설정 파일 열기', '기본 주소로 되돌리기', '취소'], defaultId: 0, cancelId: 2,
    message: '서버 주소 바꾸기',
    detail: `지금 주소: ${APP_URL}\n\n설정 파일(config.json)의 "url" 값을 고친 뒤 앱을 다시 켜 주세요.`,
  });
  if (r.response === 0) { writeConfig({ url: APP_URL }); void shell.openPath(configPath()); }
  if (r.response === 1) { writeConfig({ url: DEFAULT_URL }); app.relaunch(); quitting = true; app.quit(); }
}

// ---- 배지 (웹 → preload → 여기) ----
ipcMain.on('badge', (_e, { count, dataUrl }) => {
  unread = Number(count) || 0;
  if (isMac) app.dock?.setBadge(unread ? String(unread) : '');
  if (isWin && win) win.setOverlayIcon(unread && dataUrl ? nativeImage.createFromDataURL(dataUrl) : null, unread ? `안 읽은 메시지 ${unread}` : '');
  if (win && unread) win.flashFrame(false);
  tray?.setToolTip(unread ? `SKYNET — 안 읽은 메시지 ${unread}` : 'SKYNET');
  tray?.setContextMenu(trayMenu());
});
// ---- 알림 (웹 → preload → 여기). 누르면 창을 앞으로 가져오고 해당 방을 열도록 웹에 알려 줍니다 ----
ipcMain.on('notify', (_e, { title, body, roomId, silent }) => {
  if (!Notification.isSupported()) return;
  if (win?.isFocused() && win.isVisible()) return; // 보고 있는 중이면 화면에 바로 들어오므로 생략
  const n = new Notification({ title: title || 'SKYNET', body: body || '', silent: !!silent, icon: isWin ? icon('icon.png') : undefined });
  n.on('click', () => { showWindow(); if (roomId) win?.webContents.send('open-room', roomId); });
  n.show();
  if (isWin && win && !win.isFocused()) win.flashFrame(true);
});
ipcMain.handle('desktop-info', () => ({ platform: process.platform, version: app.getVersion(), url: APP_URL }));
ipcMain.on('focus', showWindow);

// ---- 앱 생애 ----
app.whenReady().then(() => {
  // 웹 알림 권한은 늘 허용 (운영체제 알림으로 바꿔 보냄)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'media'].includes(permission)));
  createWindow();
  createTray();
  if (isMac) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: app.name, submenu: [{ role: 'about', label: 'SKYNET 정보' }, { type: 'separator' }, { role: 'hide', label: '숨기기' }, { role: 'hideOthers' }, { type: 'separator' }, { label: '종료', accelerator: 'Cmd+Q', click: () => { quitting = true; app.quit(); } }] },
      { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '보기', submenu: [{ role: 'reload', label: '새로 고침' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
      { label: '윈도우', submenu: [{ role: 'minimize' }, { role: 'close', label: '닫기' }, { label: 'SKYNET 열기', click: showWindow }] },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
});
app.on('activate', showWindow); // Mac: Dock 아이콘 클릭
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* 트레이에 남아 있음 */ });
