"use strict";
const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");

function createUpdates({ app, dialog, Menu, autoUpdater, prepareForInstall,
  platform = process.platform, production = false, interval = setInterval,
  clear = clearInterval, preferences }) {
  const enabled = app.isPackaged && production && platform === "darwin" &&
    /^\d+\.\d+\.\d+$/.test(app.getVersion());
  let automatic = false, task = null, timer = null, downloaded = null;
  let installing = false, disposed = false, ready = false, approved = false, failureTask = null;
  const preferenceFile = () => preferences || path.join(app.getPath("userData"), "one-updates.json");
  function loadPreferences() {
    try {
      const file = preferenceFile();
      if (fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && fs.statSync(file).size < 1024)
        automatic = JSON.parse(fs.readFileSync(file, "utf8")).automaticChecks === true;
    } catch { /* Missing or damaged preferences never opt a user into requests. */ }
  }
  function newer(version) {
    return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) &&
      semver.valid(version) && semver.gt(version, app.getVersion());
  }
  async function message(options) {
    if (disposed) return { response: 1 };
    return dialog.showMessageBox({ title: "Integral One updates", noLink: true, ...options });
  }
  async function failure(stopped = installing) {
    if (failureTask) return failureTask;
    installing = false;
    failureTask = message({ type: "warning", message: "The update could not be completed.",
      detail: stopped ? "Reopen Integral One to continue with the installed version. Your workspace files have been retained."
        : "Check your connection and try again later. Your installed version and workspace files have been retained.",
      buttons: stopped ? ["Reopen Integral One", "Later"] : ["OK"], cancelId: stopped ? 1 : 0 })
      .then(result => { if (stopped && result.response === 0) { app.relaunch(); app.quit(); } })
      .finally(() => { failureTask = null; });
    return failureTask;
  }
  // These controls deliberately retain the SDK's checksum and macOS code-signature
  // verification. No custom feed, credential, renderer IPC or verifier override.
  if (enabled) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.logger = null;
    autoUpdater.on("error", onError);
  }
  function onError() {
    // Check/download promises report their own failure. Native install errors can
    // arrive later, after quitAndInstall has returned, and must also be handled.
    if (installing) void failure(true);
  }
  async function offerRestart() {
    const result = await message({ type: "info", message: `Integral One ${downloaded} is ready to install.`,
      detail: "Finish your work before restarting. Integral One will stop its local engine before installing the update.",
      buttons: ["Restart and Install", "Later"], defaultId: 1, cancelId: 1 });
    if (result.response !== 0 || disposed) return;
    // Do not replace a running installation or proceed after a failed engine stop.
    await prepareForInstall();
    installing = true;
    autoUpdater.quitAndInstall();
  }
  async function performCheck(manual) {
    if (!enabled) {
      if (manual) await message({ type: "info", message: "Automatic updates are unavailable in this build.",
        detail: "Use an official macOS release installed in Applications. Other platforms remain under qualification.", buttons: ["OK"] });
      return;
    }
    if (installing || disposed) return;
    if (downloaded) { if (manual) await offerRestart(); return; }
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version;
    if (!newer(version)) {
      if (manual) await message({ type: "info", message: "Integral One is up to date.", buttons: ["OK"] });
      return;
    }
    const choice = await message({ type: "info", message: `Integral One ${version} is available.`,
      detail: "Download this update from Integral One’s public GitHub releases? You will choose when to restart and install it.",
      buttons: ["Download Update", "Later"], defaultId: 1, cancelId: 1 });
    if (choice.response !== 0 || disposed) return;
    approved = true;
    await autoUpdater.downloadUpdate();
    downloaded = version;
    await offerRestart();
  }
  function check(manual = true) {
    if (!task) {
      task = performCheck(manual).catch(async () => { if (manual || approved || downloaded || installing) await failure(); })
        .finally(() => { task = null; approved = false; });
    }
    return task;
  }
  function schedule() {
    if (timer) clear(timer);
    timer = null;
    if (!enabled || !automatic || !ready || disposed) return;
    timer = interval(() => { void check(false); }, 6 * 60 * 60 * 1000);
    timer.unref?.();
  }
  const menuItems = [
    { label: "Check for Updates…", click: () => { void check(true); } },
    { id: "one-automatic-update-checks", label: "Automatically Check for Updates", type: "checkbox", checked: automatic, enabled,
      click: (item) => {
        try {
          const file = preferenceFile();
          fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
          if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error("Invalid preferences");
          fs.writeFileSync(file, JSON.stringify({ automaticChecks: item.checked }) + "\n", { mode: 0o600 });
          automatic = item.checked;
          schedule();
          if (automatic && ready) void check(false);
        } catch { item.checked = automatic; void failure(); }
      } },
  ];
  function start() {
    if (ready || disposed) return;
    ready = true;
    // runDesktop establishes the stable Integral userData path before onReady.
    // Reading earlier would lose the user's choice across branded app launches.
    loadPreferences();
    menuItems[1].checked = automatic;
    const item = Menu?.getApplicationMenu()?.getMenuItemById("one-automatic-update-checks");
    if (item) item.checked = automatic;
    schedule();
    if (automatic && enabled) void check(false);
  }
  function dispose() {
    disposed = true;
    if (timer) clear(timer);
    if (enabled) autoUpdater.removeListener("error", onError);
  }
  app.once("will-quit", dispose);
  return { menuItems, start, check, dispose };
}
module.exports = { createUpdates };
