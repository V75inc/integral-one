"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("integralUpdates", Object.freeze({
  model: () => ipcRenderer.invoke("integral-one:updates-model"),
  choose: (id, index) => ipcRenderer.invoke("integral-one:updates-action", id, index),
  onStatus: listener => {
    const wrapped = (_event, model) => listener(model);
    ipcRenderer.on("integral-one:update-status", wrapped);
    return () => ipcRenderer.removeListener("integral-one:update-status", wrapped);
  },
}));
