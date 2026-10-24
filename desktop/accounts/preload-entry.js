"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "integralActivation",
  Object.freeze({
    start: () => ipcRenderer.invoke("integral-one:account-start"),
    restartSignin: () => ipcRenderer.invoke("integral-one:account-restart"),
    context: () => ipcRenderer.invoke("integral-one:activation-context"),
    onStatus: (listener) => {
      const channel = "integral-one:account-status";
      const wrapped = (_event, status) => listener(status);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
    offline: () => ipcRenderer.invoke("integral-one:account-offline"),
    recover: () => ipcRenderer.invoke("integral-one:activation-recovery"),
  }),
);
