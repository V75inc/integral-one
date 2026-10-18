"use strict";
const { contextBridge, ipcRenderer } = require("electron");
require("@clerk/electron/preload").exposeClerkBridge();
contextBridge.exposeInMainWorld(
  "integralActivation",
  Object.freeze({
    restartSignin: () => ipcRenderer.invoke("integral-one:account-restart"),
    context: () => ipcRenderer.invoke("integral-one:activation-context"),
    offline: () => ipcRenderer.invoke("integral-one:account-offline"),
    register: (token) => ipcRenderer.invoke("integral-one:activate", token),
    importReceipt: (code) =>
      ipcRenderer.invoke("integral-one:activation-import", code),
    copyInstallation: () => ipcRenderer.invoke("integral-one:activation-copy"),
    recover: () => ipcRenderer.invoke("integral-one:activation-recovery"),
  }),
);
