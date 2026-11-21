'use strict';
// Sorter Monitor — aplicativo Windows (Electron). Abre o painel numa janela própria, mantém rodando na bandeja
// (alertas continuam chegando com a janela fechada) e conversa com o sorter por um proxy local.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { start } = require('./server');

const PORT = 8750;
let win = null, tray = null, srv = null, quitting = false, url = '', loginWin = null, loginAt = 0;
const BASE = process.env.SORTER_BASE || 'http://10.1.164.9';
const hidden = process.argv.includes('--hidden');

app.setAppUserModelId('br.sorter.monitor');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => show());

const icon = () => nativeImage.createFromPath(path.join(__dirname, 'web', 'icons', '128.png'));

function show() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

// ---- posição/tamanho da janela lembrados entre aberturas ----
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() {
  try {
    const st = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const ok = screen.getAllDisplays().some((d) => st.x >= d.bounds.x - 40 && st.y >= d.bounds.y - 40 && st.x < d.bounds.x + d.bounds.width - 100 && st.y < d.bounds.y + d.bounds.height - 100);
    return ok ? st : { width: st.width, height: st.height, maximized: st.maximized };
  } catch (e) { return {}; }
}
let saveT = 0;
function saveState() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    try { const b = win.getNormalBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch (e) { /* sem disco */ }
  }, 400);
}

const NATIVE_BAR = process.platform === 'win32' || process.platform === 'darwin';
function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1600, height: st.height || 940, minWidth: 1000, minHeight: 620, show: false,
    title: 'Sorter Monitor', icon: icon(), backgroundColor: '#f3f5fa', autoHideMenuBar: true,
    // barra de título integrada ao cabeçalho do painel (botões nativos do Windows por cima); no Linux mantém a moldura padrão
    ...(NATIVE_BAR ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#ffffff', symbolColor: '#1b2740', height: 54 } } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, spellcheck: false, enableWebSQL: false }
  });
  Menu.setApplicationMenu(null);
  win.removeMenu();
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => { if (!hidden) win.show(); });
  setTimeout(() => { if (win && !win.isDestroyed() && !hidden && !win.isVisible()) win.show(); }, 4000);
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.loadURL(url + '/dashboard.html');
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(url)) { e.preventDefault(); shell.openExternal(u); } });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('resize', saveState); win.on('move', saveState); win.on('maximize', saveState); win.on('unmaximize', saveState);
  win.on('page-title-updated', (e) => e.preventDefault());
  // atalhos (a janela não tem barra de menu)
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const ctrl = i.control || i.meta, k = i.key;
    if (k === 'F5' || (ctrl && k.toLowerCase() === 'r')) { win.webContents.reload(); e.preventDefault(); }
    else if (k === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (ctrl && (k === '=' || k === '+')) { win.webContents.setZoomLevel(Math.min(3, win.webContents.getZoomLevel() + 0.5)); e.preventDefault(); }
    else if (ctrl && k === '-') { win.webContents.setZoomLevel(Math.max(-3, win.webContents.getZoomLevel() - 0.5)); e.preventDefault(); }
    else if (ctrl && k === '0') { win.webContents.setZoomLevel(0); e.preventDefault(); }
    else if (ctrl && i.shift && k.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // menu de contexto enxuto (copiar/colar), sem "Inspecionar" nem "Voltar" de navegador
  win.webContents.on('context-menu', (_e, p) => {
    const t = [];
    if (p.isEditable) t.push({ role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' });
    else if (p.selectionText) t.push({ role: 'copy', label: 'Copiar' });
    if (t.length) Menu.buildFromTemplate(t).popup({ window: win });
  });
}

// ---- login no sorter: o sorter exige sessão (usuário/senha na tela dele). O login é feito na própria tela do sorter. ----
async function pullCookies() {
  const ses = session.fromPartition('persist:sorter');
  const host = new URL(BASE).hostname;
  const cs = await ses.cookies.get({});
  const o = {};
  for (const c of cs) if (c.domain === host || c.domain === '.' + host) o[c.name] = c.value;
  if (srv && Object.keys(o).length) srv.setCookies(new URL(BASE).origin, o);
  return Object.keys(o).length;
}
async function openLogin(force) {
  if (loginWin) { loginWin.show(); loginWin.focus(); return; }
  if (!force && Date.now() - loginAt < 60000) return; // não fica reabrindo
  loginAt = Date.now();
  if (srv && !force) { await pullCookies(); if ((await srv.check(BASE)) === 'ok') return; }
  loginWin = new BrowserWindow({ width: 980, height: 720, title: 'Entrar no sorter', icon: icon(), autoHideMenuBar: true, parent: win && win.isVisible() ? win : undefined,
    webPreferences: { partition: 'persist:sorter', contextIsolation: true, nodeIntegration: false } });
  const w = loginWin;
  w.setMenu(null);
  w.loadURL(BASE + '/home').catch(() => {});
  w.webContents.on('did-fail-load', (_e, code, desc, u, main) => { if (main && code !== -3) w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="font:16px sans-serif;padding:40px"><h2>Sem conexão com o sorter</h2><p>Não foi possível abrir ${BASE}. Confira se este computador está na rede do sorter e tente de novo.</p><button onclick="location.href='${BASE}/home'">Tentar de novo</button></body>`)); });
  const probe = async () => {
    if (w.isDestroyed()) return;
    await pullCookies();
    if ((await srv.check(BASE)) === 'ok') { w.close(); if (win) win.webContents.reload(); }
  };
  w.webContents.on('did-navigate', () => setTimeout(probe, 600));
  w.webContents.on('did-navigate-in-page', () => setTimeout(probe, 600));
  w.on('closed', () => { loginWin = null; });
}

function menuTemplate() {
  return [
    { label: 'Sorter Monitor ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: 'Entrar no sorter (login)…', click: () => openLogin(true) },
    { label: 'Recarregar painel\tF5', click: () => win && win.webContents.reload() },
    { label: 'Tela cheia (modo TV)\tF11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
    { type: 'separator' },
    { label: 'Aumentar zoom\tCtrl +', click: () => win && win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5) },
    { label: 'Diminuir zoom\tCtrl -', click: () => win && win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5) },
    { label: 'Zoom padrão\tCtrl 0', click: () => win && win.webContents.setZoomLevel(0) },
    { type: 'separator' },
    { label: 'Iniciar com o Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--hidden'] }) },
    { label: 'Abrir no navegador', click: () => shell.openExternal(url + '/dashboard.html') },
    { label: 'Minimizar para a bandeja', click: () => win && win.hide() },
    { type: 'separator' },
    { label: 'Sair do Sorter Monitor', click: () => { quitting = true; app.quit(); } }
  ];
}

function createTray() {
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.setToolTip('Sorter Monitor');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Abrir painel', click: show },
    { label: 'Entrar no sorter (login)…', click: () => openLogin(true) },
    { label: 'Abrir no navegador', click: () => shell.openExternal(url + '/dashboard.html') },
    { type: 'separator' },
    { label: 'Iniciar com o Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Sair do Sorter Monitor', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('click', show);
  tray.on('double-click', show);
  tray.on('right-click', () => tray.setContextMenu(menu()));
}

ipcMain.on('app:show', show);
ipcMain.on('app:menu', (_e, p) => { if (win) Menu.buildFromTemplate(menuTemplate()).popup({ window: win, x: Math.round(p.x), y: Math.round(p.y) }); });
ipcMain.on('app:titlebar', (_e, o) => {
  if (!win || win.isDestroyed()) return;
  try { win.setBackgroundColor(o.bg || '#f3f5fa'); if (NATIVE_BAR && win.setTitleBarOverlay) win.setTitleBarOverlay({ color: o.color || '#ffffff', symbolColor: o.symbol || '#1b2740', height: Math.max(32, Math.min(120, Math.round(o.height || 68))) }); } catch (e) { /* plataforma sem overlay */ }
});
ipcMain.on('app:tooltip', (_e, t) => { if (tray) tray.setToolTip(String(t).slice(0, 120)); });
ipcMain.on('app:badge', (_e, t) => { if (win) win.setTitle('Sorter Monitor · ' + t); });

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications' || perm === 'fullscreen'));
  let s;
  const opts = { webRoot: path.join(__dirname, 'web'), defaultBase: BASE, onAuth: () => openLogin(false) };
  try { s = await start({ ...opts, port: PORT }); }
  catch (e) { s = await start({ ...opts, port: 0 }); }
  srv = s; url = 'http://127.0.0.1:' + s.port;
  createTray();
  createWindow();
  try { await pullCookies(); if ((await srv.check(BASE)) === 'login') openLogin(true); } catch (e) { /* tenta depois */ }
});
app.on('before-quit', () => { quitting = true; if (srv) srv.close(); });
app.on('window-all-closed', () => { /* continua na bandeja */ });
