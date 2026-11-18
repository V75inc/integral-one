"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const { createUpdateCenter } = require("../desktop/update-center");
function fixture(t, options = {}) {
  const handlers = new Map(), windows = [], notifications = [], app = new EventEmitter();
  class Notice extends EventEmitter { static isSupported() { return true; } constructor(options) { super(); this.options = options; notifications.push(this); } show() {} }
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: "" }; this.webContents.getURL = () => this.webContents.mainFrame.url; this.webContents.send = (_channel, model) => { this.model = model; }; this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; }; windows.push(this); }
    static getAllWindows() { return windows; }
    async loadFile(file) { this.webContents.mainFrame.url = require("node:url").pathToFileURL(file).href; }
    isDestroyed() { return false; } setMenu() {} showInactive() { this.inactive = true; } show() { this.shown = true; } focus() { this.focused = true; } hide() { this.hidden = true; } isMinimized() { return false; } destroy() { this.destroyed = true; }
  }
  const center = createUpdateCenter({ app, BrowserWindow: Window, Notification: Notice, ...options, ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) } });
  t.after(center.dispose);
  return { app, center, windows, handlers, notifications, trusted: win => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame }) };
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

test("a deferred notification resumes a fresh update action rather than reviving a resolved dialog", async t => {
  let resumed = 0, next;
  const options = { message: "Integral Core 0.1.1rc63 is available.", buttons: ["Download Update", "Later"], automatic: true };
  const f = fixture(t, { onResume: () => { resumed++; next = f.center.showMessageBox({ ...options, automatic: false }); } });
  const first = f.center.showMessageBox(options);
  await new Promise(resolve => setImmediate(resolve));
  const win = f.windows[0], event = f.trusted(win), old = win.model.id;
  f.handlers.get("integral-one:updates-action")(event, old, 1);
  assert.deepEqual(await first, { response: 1 });
  f.notifications[0].emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resumed, 1);
  assert.notEqual(win.model.id, old);
  assert.throws(() => f.handlers.get("integral-one:updates-action")(event, old, 0), /Invalid/);
  f.handlers.get("integral-one:updates-action")(event, win.model.id, 0);
  assert.deepEqual(await next, { response: 0 });
});

for (const deferAt of ["download", "restart"]) {
  test(`deferred ${deferAt} notification preserves separate consent through the real update controller`, async t => {
    const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
    const { createUpdates } = require("../desktop/updates");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "one-notice-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    let updates, resumed, downloads = 0, installs = 0, staged = false;
    const f = fixture(t, { onResume: () => { resumed = updates.check(true); return resumed; } });
    f.app.isPackaged = true; f.app.getVersion = () => "0.1.13"; f.app.getPath = () => root;
    const candidate = { manifest: { core: { version: "0.1.1rc63" }, payload: { sha256: "a".repeat(64) } } };
    updates = createUpdates({ app: f.app, dialog: f.center, autoUpdater: new EventEmitter(), enabled: true,
      channel: "development", platform: "darwin", arch: "arm64", currentCore: { version: "0.1.1rc58" },
      preferences: path.join(root, "preferences.json"), interval: () => ({ unref() {} }), clear() {},
      discover: async () => ({ latestCore: "0.1.1rc63", candidate: null }),
      runtimeUpdates: { recovery: () => null, staged: () => staged ? candidate : null, failed: () => null,
        check: async () => ({ candidate }), stage: async () => { downloads++; staged = true; },
        install: async () => { installs++; } } });
    t.after(updates.dispose);
    const tick = () => new Promise(resolve => setImmediate(resolve));
    const choose = response => { const win=f.windows[0]; f.handlers.get("integral-one:updates-action")(f.trusted(win),win.model.id,response); };
    const first = updates.start(); await tick();
    assert.equal(downloads, 0); assert.equal(installs, 0);
    if (deferAt === "download") {
      choose(1); await first;
      f.notifications[0].emit("click"); await tick();
      assert.equal(downloads, 0); choose(0); await tick();
    } else { choose(0); await tick(); }
    assert.equal(downloads, 1); assert.equal(installs, 0);
    assert.match(f.windows[0].model.title, /ready to install/);
    choose(1); await (resumed || first);
    const note = deferAt === "restart" ? f.notifications.find(n => /ready to install/.test(n.options.body)) : f.notifications[0];
    assert.ok(note); note.emit("click"); await tick();
    assert.match(f.windows[0].model.title, /ready to install/);
    assert.equal(downloads, 1); assert.equal(installs, 0);
    choose(0); await resumed;
    assert.equal(installs, 1); assert.equal(downloads, 1);
  });
}

test("a closed progress view reopens without creating a stale action or starting another check", async t => {
 let checks=0;const f=fixture(t,{onResume:()=>{checks++;}});
 const first=f.center.showMessageBox({message:"Update available.",buttons:["Download Update","Later"]});
 await new Promise(done=>setImmediate(done));let win=f.windows[0];
 f.handlers.get("integral-one:updates-action")(f.trusted(win),win.model.id,0);await first;
 f.center.progress("Downloading your update…",42);win.emit("closed");
 await f.center.resume();win=f.windows.at(-1);assert.equal(f.windows.length,2);assert.equal(checks,0);
 assert.equal(win.model.progress,42);assert.deepEqual(win.model.buttons,[]);
 assert.throws(()=>f.handlers.get("integral-one:updates-action")(f.trusted(win),win.model.id,0),/Invalid/);
 f.center.dispose();await f.center.resume();assert.equal(f.windows.length,2);
});
