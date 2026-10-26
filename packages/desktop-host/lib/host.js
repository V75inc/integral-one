'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, dialog, shell, session, systemPreferences, nativeTheme, nativeImage, ipcMain } = require('electron');
const { validateWorkspace } = require('./origins');

// Electron security baseline: https://www.electronjs.org/docs/latest/tutorial/security
const { createPermissions } = require('./permissions');
const { createThemeIcons } = require('./theme-icons');
const { captionOverlay, popupRequest, chromeMenus, chromeArgument, mainWindowChrome, startupFrame } = require('./window-chrome');
function runDesktop(options = {}) {
const themeIcons = createThemeIcons({ app, nativeTheme, nativeImage, BrowserWindow, iconRoot: options.iconRoot });
let window = null;
let runtime = null;
let windowChrome = false;
let windowChromeMenus = [];
let workspace = null;
let quitting = false;
let booting = true;
let permissions = null;
let stopping = null;
app.setName(options.productName || 'Integral');
// Keep product storage explicit; never rename an existing data home for branding.
if (options.userDataName && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', path.join(app.getPath('appData'), options.userDataName));
}

function flag(name) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function externalUrl(raw) {
  try {
    const url = new URL(raw);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    title: options.windowTitle || options.productName || 'Integral', icon: themeIcons.current(), backgroundColor: '#ffffff', show: false,
    ...mainWindowChrome(windowChrome),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      ...(windowChrome ? { additionalArguments: [chromeArgument(windowChromeMenus)] } : {}),
      ...(runtime ? { preload: path.join(__dirname, 'preload.js') } : {}) },
  });
  window.once('ready-to-show', () => window?.show());
  window.on('page-title-updated', event => {
    event.preventDefault();
    window?.setTitle(options.windowTitle || options.productName || 'Integral');
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (externalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    let sameOrigin = false;
    try { sameOrigin = new URL(url).origin === new URL(workspace).origin; } catch { /* blocked */ }
    if (!sameOrigin) {
      event.preventDefault();
      if (externalUrl(url)) void shell.openExternal(url);
    }
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('closed', () => { window = null; });
  await window.loadURL(workspace);
}

async function boot() {
  // System chrome must follow appearance while onboarding is still open.
  themeIcons.start();
  const profilePath = app.getPath('userData');
  // Trusted distribution code may complete onboarding before local authority boots.
  // This hook is deliberately provider-neutral and never runs inside a renderer.
  if (options.beforeBoot) await options.beforeBoot({ userData: profilePath });
  fs.mkdirSync(profilePath, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(profilePath, 0o700);
  permissions = createPermissions({ session: session.defaultSession, systemPreferences, dialog, shell,
    consentPath: path.join(app.getPath('userData'), 'desktop-permissions.json'),
    getWindow: () => window, getWorkspace: () => workspace });
  const remote = flag('workspace-url') || process.env.INTEGRAL_WORKSPACE_URL;
  if (options.mode === 'local' && remote) throw new Error('This local distribution does not accept a remote workspace URL.');
  if (options.mode === 'remote' || remote) {
    if (!remote) throw new Error('Set an approved HTTPS Business workspace with --workspace-url. Existing local Business data is preserved; see the recovery guide.');
    workspace = validateWorkspace(remote);
  } else {
    const { startCore } = require('./core-runtime');
    const resources = app.isPackaged ? process.resourcesPath : options.resources;
    const home = flag('home') || process.env.INTEGRAL_HOME || path.join(app.getPath('userData'), 'core');
    const splash = options.loadingScreen || {};
    const splashBackground = splash.backgroundColor || '#ffffff';
    const progress = new BrowserWindow({ width: splash.width || 560, height: splash.height || 220, resizable: false,
      title: splash.title || 'Starting Integral', backgroundColor: splashBackground, icon: themeIcons.current(),
      ...(options.windowsTitleBar === true && process.platform === 'win32' ? startupFrame(splashBackground) : {}),
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } });
    if (process.platform === 'win32') progress.setMenu?.(null);
    await progress.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splash.html ||
      '<html><body style="font:16px system-ui;padding:30px"><h2>Starting Integral</h2><p role="status">Preparing your private workspace. The first launch downloads its runtime; later launches reuse it.</p></body></html>'
    ));
    const onProgress = message => {
      if (progress.isDestroyed()) return;
      void progress.webContents.executeJavaScript(
        `document.querySelector('[role="status"]')?.replaceChildren(document.createTextNode(${JSON.stringify(message)}))`
      ).catch(() => {});
    };
    try { runtime = await startCore({ home, resources, onProgress }); workspace = runtime.web_url; }
    finally { progress.close(); }
  }
  const applicationMenu = Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { id: 'file', label: 'File', submenu: [
      { label: 'Set Up AI Model…', click: () => { void window?.loadURL(new URL('/settings#ai-models', workspace).href); } },
      ...(!runtime ? [{ label: 'Open in Browser', click: () => shell.openExternal(workspace) }] : []),
      { label: 'Microphone Access…', click: () => { void permissions.setup({ force: true }).catch(error => dialog.showErrorBox('Microphone setup needs attention', error.message)); } },
      ...(runtime ? [{ label: 'Open Installation Folder', click: () => shell.openPath(runtime.home) }] : []),
      { type: 'separator' }, { role: 'quit' },
    ] },
    { id: 'edit', label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'delete' },
    ] },
    { id: 'view', label: 'View', submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      ...(process.platform === 'win32' ? [] : [{ type: 'separator' }, { role: 'togglefullscreen' }]),
    ] },
    ...(options.helpMenuItems?.length ? [{ id: 'help', label: 'Help', submenu: options.helpMenuItems }] : []),
  ]);
  Menu.setApplicationMenu(applicationMenu);
  windowChrome = options.windowsTitleBar === true && process.platform === 'win32' && Boolean(runtime);
  windowChromeMenus = windowChrome ? chromeMenus(Array.isArray(applicationMenu) ? applicationMenu : applicationMenu.items) : [];
  if (windowChrome) {
    const { trustedSender } = require('./local-session');
    ipcMain.handle('integral:window-chrome-popup', async (event, id, x, y) => {
      if (!trustedSender(event, window, workspace)) throw new Error('Untrusted desktop session caller.');
      const request = popupRequest(id, x, y, window.getContentSize());
      if (!request) return null;
      const item = Menu.getApplicationMenu()?.getMenuItemById(request.id);
      if (!item?.submenu?.popup) return null;
      item.submenu.popup({ window, x: request.x, y: request.y });
      return true;
    });
    ipcMain.handle('integral:window-chrome-theme', async (event, theme) => {
      if (!trustedSender(event, window, workspace)) throw new Error('Untrusted desktop session caller.');
      const overlay = captionOverlay(theme);
      if (!overlay || !window?.setTitleBarOverlay) return null;
      window.setTitleBarOverlay(overlay);
      window.setBackgroundColor(overlay.color);
      return overlay.color;
    });
  }
  // A bundled Core upgrade may remove assets named by a previously cached shell.
  if (runtime) await session.defaultSession.clearCache();
  if (runtime) {
    const { createSessionHandler, trustedSender } = require('./local-session');
    ipcMain.handle('integral:local-session', createSessionHandler({
      getRuntime: () => runtime,
      authorize: () => options.account?.authorizeSession?.(),
      isTrusted: event => trustedSender(event, window, workspace),
    }));
  }
  if (runtime) for (const [method, callback] of Object.entries({
    profile: options.account?.profile,
    signOut: options.account?.signOut,
    signIn: options.account?.signIn,
    resumeOffline: options.account?.resumeOffline,
  })) {
    ipcMain.handle(`integral:account-${method}`, async event => {
      const { trustedSender } = require('./local-session');
      if (!runtime || !trustedSender(event, window, workspace)) throw new Error('Untrusted desktop account caller.');
      if (!callback) return null;
      return callback();
    });
  }
  // Trusted product composition may initialize local preferences before the UI
  // reads them. Remote hosts never receive local runtime authority.
  if (runtime) await options.beforeWorkspace?.({ runtime });
  await createWindow();
  booting = false;
  await options.onReady?.();
  // Microphone consent is requested only by an explicit user action.
}

async function stopRuntime({ requireExclusive = false } = {}) {
  if (!runtime?.owned) {
    if (requireExclusive && runtime && !runtime.stopped)
      throw new Error('Another process owns this workspace. Stop it before updating Integral.');
    return;
  }
  if (!stopping) {
    const owned = runtime;
    const { runCli } = require('./core-runtime');
    stopping = runCli(owned.cli, ['stop', '--home', owned.home, '--json',
      '--if-pid', String(owned.pid), '--if-created', String(owned.process_created)])
      .then(result => {
        if (result?.state !== 'stopped') throw new Error('Core is still running. Close the workspace before retrying.');
        owned.owned = false; owned.stopped = true;
      })
      .finally(() => { stopping = null; });
  }
  return stopping;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(boot).catch(error => {
    dialog.showErrorBox('Integral could not start', error.message);
    app.quit();
  });
  app.on('activate', () => { if (!window && workspace) void createWindow(); });
  app.on('window-all-closed', () => { if (!booting && process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (!runtime?.owned || quitting) return;
    event.preventDefault(); quitting = true;
    void stopRuntime().then(() => app.quit()).catch(error => {
      quitting = false;
      dialog.showErrorBox('Integral shutdown needs attention', error.message);
    });
  });
}

let preparingUpdate = null;
function prepareUpdate({ backupDirectory } = {}) {
  if (!preparingUpdate) preparingUpdate = require('./update-backup').backupRuntime({
    runtime, stop: stopRuntime, directory: backupDirectory, runCli: require('./core-runtime').runCli,
  }).finally(() => { preparingUpdate = null; });
  return preparingUpdate;
}
return { stopRuntime, prepareUpdate };

}
module.exports = { runDesktop };
