'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const chromeArgument = process.argv.find(arg => typeof arg === 'string' && arg.startsWith('--integral-window-chrome='));
let windowChrome;
if (chromeArgument) {
  try {
    const parsed = JSON.parse(chromeArgument.slice('--integral-window-chrome='.length));
    if (parsed && Number.isInteger(parsed.height) && Array.isArray(parsed.menus)) {
      windowChrome = Object.freeze({
        height: parsed.height,
        menus: Object.freeze(parsed.menus.map(menu => Object.freeze({ id: menu.id, label: menu.label }))),
        popupMenu: (id, x, y) => ipcRenderer.invoke('integral:window-chrome-popup', id, x, y),
        setCaptionTheme: theme => ipcRenderer.invoke('integral:window-chrome-theme', theme),
      });
    }
  } catch { /* A malformed argument leaves the system title bar in place. */ }
}

contextBridge.exposeInMainWorld('integralDesktop', Object.freeze({
  profile: () => ipcRenderer.invoke('integral:account-profile'),
  signOut: () => ipcRenderer.invoke('integral:account-signOut'),
  signIn: () => ipcRenderer.invoke('integral:account-signIn'),
  resumeOffline: () => ipcRenderer.invoke('integral:account-resumeOffline'),
  session: () => ipcRenderer.invoke('integral:local-session'),
  ...(windowChrome ? { windowChrome } : {}),
}));
