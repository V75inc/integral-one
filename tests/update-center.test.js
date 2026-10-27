"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const { createUpdateCenter } = require("../desktop/update-center");
function fixture(t) {
  const handlers = new Map(), windows = [], app = new EventEmitter();
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: "" }; this.webContents.getURL = () => this.webContents.mainFrame.url; this.webContents.send = (_channel, model) => { this.model = model; }; this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; }; windows.push(this); }
    static getAllWindows() { return windows; }
    async loadFile(file) { this.webContents.mainFrame.url = require("node:url").pathToFileURL(file).href; }
    isDestroyed() { return false; } setMenu() {} showInactive() { this.inactive = true; } show() { this.shown = true; } focus() { this.focused = true; } hide() { this.hidden = true; } isMinimized() { return false; } destroy() { this.destroyed = true; }
  }
  const center = createUpdateCenter({ app, BrowserWindow: Window, ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) } });
  t.after(center.dispose);
  return { center, windows, handlers, trusted: win => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame }) };
}
test("the One update window is sandboxed, isolated and accepts only its own frame and current action nonce", async t => {
  const f = fixture(t), answer = f.center.showMessageBox({ message: "Integral Core update", detail: "Your workspace is retained", buttons: ["Download Update", "Later"], automatic: true });
  await new Promise(resolve => setImmediate(resolve)); const win = f.windows[0], event = f.trusted(win);
  assert.equal(win.options.webPreferences.sandbox, true); assert.equal(win.options.webPreferences.contextIsolation, true); assert.equal(win.options.webPreferences.nodeIntegration, false); assert.ok(win.inactive); assert.equal(win.focused, undefined);
  const model = f.handlers.get("integral-one:updates-model")(event); assert.equal(model.buttons[0], "Download Update");
  assert.throws(() => f.handlers.get("integral-one:updates-model")({ sender: {}, senderFrame: {} }), /Untrusted/);
  assert.throws(() => f.handlers.get("integral-one:updates-action")(event, "stale", 0), /Invalid/);
  assert.throws(() => f.handlers.get("integral-one:updates-action")({ ...event, senderFrame: { url: event.senderFrame.url } }, model.id, 0), /Invalid/);
  f.handlers.get("integral-one:updates-action")(event, model.id, 0); assert.deepEqual(await answer, { response: 0 }); assert.equal(win.hidden, undefined);
  assert.throws(() => f.handlers.get("integral-one:updates-action")(event, model.id, 0), /Invalid/);
});
test("closing or Later declines an update without destroying pending workspace state", async t => {
  const f = fixture(t), answer = f.center.showMessageBox({ message: "Ready to update", buttons: ["Restart to Update", "Later"] });
  await new Promise(resolve => setImmediate(resolve)); const win = f.windows[0]; let prevented = false;
  win.emit("close", { preventDefault: () => { prevented = true; } }); assert.deepEqual(await answer, { response: 1 }); assert.ok(prevented && win.hidden);
});
