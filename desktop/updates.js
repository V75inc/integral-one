"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { APP_VERSION, compareCore, channelPolicy } = require("./release-contract");
const { discoverUpdates, verifyUpdateInfo, verifyDownload } = require("./releases");

function createUpdates({ app, dialog, Menu, autoUpdater, prepareForInstall,
  platform = process.platform, arch = process.arch, enabled = false, channel = "stable",
  currentCore, request = fetch, discover = discoverUpdates, verifyDownloaded = verifyDownload,
  interval = setInterval, clear = clearInterval, preferences }) {
  const policy = channelPolicy(channel);
  const available = app.isPackaged && enabled && APP_VERSION.test(app.getVersion()) &&
    ((platform === "darwin" && arch === "arm64") || (platform === "win32" && arch === "x64"));
  let automatic = true, task = null, timer = null, downloaded = null;
  let installing = false, disposed = false, ready = false, approved = false, failureTask = null, manualRequested = false;
  const notices = new Set();
  const preferenceFile = () => preferences || path.join(app.getPath("userData"), "one-updates.json");
  function loadPreferences() {
    try {
      const file = preferenceFile(), stat = fs.lstatSync(file);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 1024) {
        const saved = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof saved.automaticChecks === "boolean") automatic = saved.automaticChecks;
      }
    } catch { /* A first launch checks automatically; a saved opt-out is retained. */ }
  }
  function savePreferences(value) {
    const file = preferenceFile(), parent = path.dirname(file);
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(parent).isSymbolicLink()) throw new Error("Invalid preferences directory.");
    try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Invalid preferences."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const temporary = path.join(parent, `.one-updates-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, JSON.stringify({ automaticChecks: value }) + "\n", { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
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
  if (available) {
    // The SDK retains its checksum and native signature verification. A Core
    // publication is offered only through the matching complete One installer.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.disableDifferentialDownload = true;
    autoUpdater.logger = null;
    autoUpdater.on("error", onError);
  }
  function onError() { if (installing) void failure(true); }
  async function offerRestart() {
    const result = await message({ type: "info", message: `Integral One ${downloaded.version} is ready to install.`,
      detail: "Finish your work before restarting. Integral One will stop its local engine before installing the update.",
      buttons: ["Restart and Install", "Later"], defaultId: 1, cancelId: 1 });
    if (result.response !== 0 || disposed) return;
    installing = true;
    await prepareForInstall();
    if (disposed) return;
    autoUpdater.quitAndInstall();
  }
  async function performCheck() {
    if (!available) {
      if (manualRequested) await message({ type: "info", message: "Installer updates are unavailable in this build.",
        detail: "Install a released Integral One build for Apple Silicon macOS or Windows x64 to use the updater.", buttons: ["OK"] });
      return;
    }
    if (installing || disposed) return;
    if (downloaded) { if (manualRequested) await offerRestart(); return; }
    const result = await discover({ currentCore: currentCore.version, currentVersion: app.getVersion(), channel, platform, arch, request });
    if (disposed) return;
    const candidate = result.candidate;
    if (!candidate) {
      const newerCore = result.latestCore && compareCore(result.latestCore, currentCore.version) > 0;
      if (newerCore && (manualRequested || !notices.has(`core:${result.latestCore}`))) {
        notices.add(`core:${result.latestCore}`);
        await message({ type: "info", message: `Integral Core ${result.latestCore} has been published.`,
          detail: "A compatible Integral One installer is being prepared. Check for updates again later; your current workspace is ready to use.", buttons: ["OK"] });
      } else if (manualRequested) await message({ type: "info", message: "Integral One is up to date.",
        detail: `Checked ${policy.registry === "pypi" ? "PyPI stable releases" : "TestPyPI development releases"} and matching Integral One installers.`, buttons: ["OK"] });
      return;
    }
    const { manifest, asset, feedUrl } = candidate;
    if (!manualRequested && notices.has(`one:${manifest.version}`)) return;
    // Feed URLs are constructed exclusively from a validated release tag in the
    // fixed V75 repository. No remote/user-supplied provider override is accepted.
    autoUpdater.setFeedURL({ provider: "generic", url: feedUrl, useMultipleRangeRequest: false });
    const update = await autoUpdater.checkForUpdates();
    verifyUpdateInfo(update?.updateInfo, candidate);
    if (disposed) return;
    notices.add(`one:${manifest.version}`);
    const choice = await message({ type: "info", message: `Integral One ${manifest.version} with Core ${manifest.core.version} is available.`,
      detail: `Download this ${channel === "development" ? "development" : "stable"} update? You will choose when to restart and install it.`,
      buttons: ["Download Update", "Later"], defaultId: 1, cancelId: 1 });
    if (choice.response !== 0 || disposed) return;
    approved = true;
    const files = await autoUpdater.downloadUpdate();
    await verifyDownloaded(files, asset);
    if (disposed) return;
    downloaded = { version: manifest.version };
    await offerRestart();
  }
  function check(manual = true) {
    if (disposed) return Promise.resolve();
    manualRequested ||= manual;
    if (!task) task = performCheck().catch(async () => {
      if (manualRequested || approved || downloaded || installing) await failure();
    }).finally(() => { task = null; approved = false; manualRequested = false; });
    return task;
  }
  function schedule() {
    if (timer) clear(timer);
    timer = null;
    if (!available || !automatic || !ready || disposed) return;
    timer = interval(() => { void check(false); }, 6 * 60 * 60 * 1000);
    timer.unref?.();
  }
  const menuItems = [
    { label: "Check for Updates…", click: () => { void check(true); } },
    { id: "one-automatic-update-checks", label: "Automatically Check for Updates", type: "checkbox", checked: automatic, enabled: available,
      click: item => {
        try {
          savePreferences(item.checked);
          automatic = item.checked;
          schedule();
          if (automatic && ready) void check(false);
        } catch { item.checked = automatic; void failure(); }
      } },
    { label: `Update channel: ${channel === "development" ? "Development (TestPyPI)" : "Stable (PyPI)"}`, enabled: false },
  ];
  function start() {
    if (ready || disposed) return;
    ready = true;
    loadPreferences();
    menuItems[1].checked = automatic;
    const item = Menu?.getApplicationMenu()?.getMenuItemById("one-automatic-update-checks");
    if (item) item.checked = automatic;
    schedule();
    if (automatic && available) return check(false);
  }
  function dispose() {
    disposed = true;
    if (timer) clear(timer);
    timer = null;
    if (available) autoUpdater.removeListener("error", onError);
  }
  app.once("will-quit", dispose);
  return { menuItems, start, check, dispose };
}
module.exports = { createUpdates };
