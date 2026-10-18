'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('integralDesktop', Object.freeze({
  profile: () => ipcRenderer.invoke('integral:account-profile'),
  signOut: () => ipcRenderer.invoke('integral:account-signOut'),
  signIn: () => ipcRenderer.invoke('integral:account-signIn'),
  resumeOffline: () => ipcRenderer.invoke('integral:account-resumeOffline'),
  session: () => ipcRenderer.invoke('integral:local-session'),
}));
