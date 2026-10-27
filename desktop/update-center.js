"use strict";
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");

function createUpdateCenter({ app, BrowserWindow, ipcMain, Notification, getWorkspaceUrl }) {
  let window = null, pending = null, model = null;
  const source = path.join(__dirname, "update-ui", "index.html"), url = pathToFileURL(source).href;
  const notified = new Set();
  function trusted(event) {
    return window && !window.isDestroyed() && event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === url;
  }
  function finish(response) {
    const current = pending; pending = null;
    if (current) current.resolve({ response });
  }
  ipcMain.handle("integral-one:updates-model", event => {
    if (!trusted(event)) throw new Error("Untrusted update window.");
    return model;
  });
  ipcMain.handle("integral-one:updates-action", (event, id, response) => {
    if (!trusted(event) || !pending || id !== model?.id || !Number.isInteger(response) || response < 0 || response >= model.buttons.length)
      throw new Error("Invalid update action.");
    const hide = response !== 0 || model.buttons.length === 1;
    finish(response); if (hide) window.hide(); return true;
  });
  function send() { if (window && !window.isDestroyed()) window.webContents.send("integral-one:update-status", model); }
  async function open(automatic = false) {
    if (!window || window.isDestroyed()) {
      const workspace = getWorkspaceUrl?.();
      const parent = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed() && workspace && candidate.webContents.getURL().startsWith(workspace));
      window = new BrowserWindow({ width: 440, height: 420, resizable: false, minimizable: false, maximizable: false,
        show: false, title: "Integral One updates", ...(parent ? { parent, modal: false } : {}),
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "update-preload.js") } });
      window.setMenu?.(null);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", event => event.preventDefault());
      window.webContents.on("will-attach-webview", event => event.preventDefault());
      window.on("close", event => {
        if (pending) { event.preventDefault(); finish(model?.cancelId ?? 1); window.hide(); }
      });
      window.on("closed", () => { window = null; });
      await window.loadFile(source);
    }
    send();
    if (automatic) window.showInactive();
    else { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  }
  async function showMessageBox(options) {
    finish(model?.cancelId ?? 1);
    model = { id: randomUUID(), title: options.message, detail: options.detail || "", buttons: options.buttons || ["OK"],
      cancelId: options.cancelId ?? 1, kind: options.type || "info", progress: null };
    const answer = new Promise(resolve => { pending = { resolve }; });
    try { await open(options.automatic === true); }
    catch (error) { finish(model.cancelId); throw error; }
    if (options.automatic && /available\.|ready to install\./.test(options.message) && !notified.has(options.message) && Notification?.isSupported?.()) {
      notified.add(options.message);
      const notification = new Notification({ title: "Integral One update", body: options.message, silent: true });
      notification.on("click", () => { void open(false); });
      notification.show();
    }
    return answer;
  }
  function progress(title, percent = null) {
    model = { id: randomUUID(), title, detail: "You can keep working while the update is prepared.", buttons: [], kind: "info", progress: percent };
    send();
  }
  function dispose() {
    finish(1);
    ipcMain.removeHandler("integral-one:updates-model"); ipcMain.removeHandler("integral-one:updates-action");
    if (window && !window.isDestroyed()) window.destroy(); window = null;
  }
  app.once("will-quit", dispose);
  return { showMessageBox, progress, dispose };
}
module.exports = { createUpdateCenter };
