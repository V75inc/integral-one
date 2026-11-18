"use strict";
// This distribution-owned preload accompanies every selected local Core UI.
// It retains the neutral host bridge and Electron's sandbox/context isolation.
if (process.isMainFrame !== false) {
  require("@integral/desktop-host/preload");
  const { ipcRenderer } = require("electron");
  const { mountUpdateIndicator } = require("../frontend/host/update-indicator");
  const bridge = {
    getState: () => ipcRenderer.invoke("integral:updates-state"),
    check: () => ipcRenderer.invoke("integral:updates-check"),
    onChange(callback) {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("integral:updates-state", listener);
      return () => ipcRenderer.removeListener("integral:updates-state", listener);
    },
  };
  const mount = () => mountUpdateIndicator(document, bridge);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
}
