"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createUpdates } = require("../desktop/updates");
function fixture(t, options = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "one-updates-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const app = new EventEmitter(), updater = new EventEmitter(), calls = [], messages = [], answers = [];
  Object.assign(app, { isPackaged: true, getVersion: () => "0.1.0", getPath: () => home,
    relaunch: () => calls.push("relaunch"), quit: () => calls.push("quit") }, options.app);
  updater.checkForUpdates = async () => { calls.push("check"); return { updateInfo: { version: "0.2.0" } }; };
  updater.downloadUpdate = async () => { calls.push("download"); };
  updater.quitAndInstall = () => { calls.push("install"); };
  const prefs = path.join(home, "one-updates.json");
  if (options.automatic) fs.writeFileSync(prefs, '{"automaticChecks":true}');
  let tick;
  const control = createUpdates({ app, autoUpdater: updater, production: true, platform: "darwin",
    prepareForInstall: async () => { calls.push("stop"); },
    dialog: { showMessageBox: async message => { messages.push(message); return { response: answers.shift() ?? 1 }; } },
    interval: fn => { tick = fn; return { unref() {} }; }, clear: () => calls.push("clear"), ...options.control });
  t.after(control.dispose);
  return { app, updater, calls, messages, answers, prefs, control, tick: () => tick?.() };
}
test("updates are opt-in, and declining a download never downloads or installs", async t => {
  const f = fixture(t); f.control.start();
  assert.deepEqual(f.calls, []);
  assert.equal(f.control.menuItems[1].checked, false);
  await f.control.check();
  assert.deepEqual(f.calls, ["check"]);
  assert.equal(f.updater.autoDownload, false);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowDowngrade, false);
  assert.equal(f.updater.allowPrerelease, false);
  assert.equal(f.updater.logger, null);
});
test("approved download waits for separate restart approval, then stops Core before install", async t => {
  const f = fixture(t); f.answers.push(0, 1);
  await f.control.check();
  assert.deepEqual(f.calls, ["check", "download"]);
  f.app.emit("before-quit");
  assert.equal(f.calls.includes("install"), false);
  f.answers.push(0);
  await f.control.check();
  assert.deepEqual(f.calls, ["check", "download", "stop", "install"]);
});
test("engine stop failure prevents install and retains the downloaded update", async t => {
  const f = fixture(t, { control: { prepareForInstall: async () => { throw new Error("Private runtime detail"); } } });
  f.answers.push(0, 0);
  await f.control.check();
  assert.equal(f.calls.includes("install"), false);
  assert.match(f.messages.at(-1).message, /could not/);
  assert.equal(JSON.stringify(f.messages).includes("Private runtime detail"), false);
});
test("duplicate checks share one request and one set of approval prompts", async t => {
  const f = fixture(t); let finish;
  f.updater.checkForUpdates = () => new Promise(resolve => { f.calls.push("check"); finish = resolve; });
  const first = f.control.check(), second = f.control.check();
  assert.equal(first, second);
  finish({ updateInfo: { version: "0.2.0" } });
  await first;
  assert.deepEqual(f.calls, ["check"]);
  assert.equal(f.messages.length, 1);
});
test("previews and unqualified platforms never contact an update feed", async t => {
  for (const options of [{ app: { isPackaged: false } }, { app: { getVersion: () => "0.1.0-dev.1" } },
    { control: { production: false } }, { control: { platform: "win32" } }]) {
    const f = fixture(t, options); f.control.start(); await f.control.check();
    assert.deepEqual(f.calls, []);
    assert.match(f.messages[0].message, /unavailable/);
  }
});
test("malformed, prerelease, equal and older versions cannot be downloaded", async t => {
  for (const version of ["bad", "0.3.0-rc.1", "0.1.0", "0.0.9", "<script>"]) {
    const f = fixture(t); f.answers.push(0);
    f.updater.checkForUpdates = async () => ({ updateInfo: { version } });
    await f.control.check();
    assert.equal(f.calls.includes("download"), false);
  }
});
test("background network failures stay quiet; approved download failures are visible and redacted", async t => {
  const f = fixture(t);
  f.updater.checkForUpdates = async () => { f.updater.emit("error", new Error("private URL")); throw new Error("private URL"); };
  await f.control.check(false);
  assert.equal(f.messages.length, 0);
  f.updater.checkForUpdates = async () => ({ updateInfo: { version: "0.2.0" } });
  f.updater.downloadUpdate = async () => { throw new Error("secret HTTP body"); };
  f.answers.push(0);
  await f.control.check(false);
  assert.match(f.messages.at(-1).message, /could not/);
  assert.equal(JSON.stringify(f.messages).includes("secret HTTP body"), false);
});
test("automatic-check choice persists and stopped timers do not generate new traffic", async t => {
  const f = fixture(t); f.control.start();
  const item = { checked: true };
  f.control.menuItems[1].click(item);
  await f.control.check();
  assert.deepEqual(JSON.parse(fs.readFileSync(f.prefs)), { automaticChecks: true });
  f.control.dispose(); f.tick(); await f.control.check(false);
  assert.deepEqual(f.calls, ["check", "clear"]);
});
test("native signature/install errors offer recovery without exposing backend error text", async t => {
  const f = fixture(t); f.answers.push(0, 0);
  await f.control.check();
  f.updater.emit("error", new Error("untrusted signed ZIP response"));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(f.messages.at(-1).detail, /installed version/);
  assert.equal(JSON.stringify(f.messages).includes("untrusted signed ZIP response"), false);
  assert.equal(f.calls.includes("relaunch"), false);
});

test("startup reads the final host data path and restores the native automatic-check choice", async t => {
  const item = { checked: false };
  const f = fixture(t, { automatic: true, control: { Menu: { getApplicationMenu: () => ({getMenuItemById: () => item}) } } });
  const correct = f.app.getPath;
  f.app.getPath = () => '/not-the-final-host-data-path';
  assert.equal(f.calls.length, 0);
  f.app.getPath = correct;
  f.control.start();
  await f.control.check();
  assert.equal(item.checked, true);
  assert.equal(f.control.menuItems[1].checked, true);
  assert.deepEqual(f.calls, ['check']);
});
