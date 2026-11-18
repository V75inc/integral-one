"use strict";
const path = require("node:path");
const fs = require("node:fs");
const electron = require("electron");
const { app, protocol } = electron;
protocol.registerSchemesAsPrivileged([
  {
    scheme: "integral-one",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const config = require("./accounts/config").loadConfig();
const { createController } = require("./accounts/controller");
let controller;
function accountController() {
  // The desktop host acquires the single product lock before beforeBoot.
  // A losing copy must not register itself as the global callback handler.
  return controller ||= createController({ electron, config });
}
const resources = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..", "resources");
if (
  !fs.existsSync(path.join(resources, "core/runtime.json")) &&
  !process.env.INTEGRAL_CORE_COMMAND
) {
  throw new Error(
    "Build the reviewed runtime first: npm run qualify:ui && npm run build:runtime.",
  );
}
let host;
let profileRuntime;
const initializeProfile = require("./accounts/local-profile").createProfileInitializer({
  getProfile: () => accountController().accountProfile(),
  authorize: (...args) => accountController().authorizeSession(...args),
});
async function prepareProfile(runtime = profileRuntime) {
  if (!runtime) return;
  profileRuntime = runtime;
  // A cosmetic setup failure must never lock an activated local workspace.
  try { await initializeProfile(runtime); }
  catch { console.warn("Local display name could not be initialized; the saved profile remains available."); }
}
const runtimeUpdates = require("./runtime-updates/manager").createRuntimeManager({
  app, resources, channel: require("../package.json").integralOneUpdates.channel,
  bundledCore: require("../distribution.json").core,
  request: (url, options) => electron.net.fetch(url, options),
  getRuntime: () => profileRuntime,
  prepareForInstall: () => require("./update-backup").prepareUpdate(host, app.getPath("userData")),
});
const updateCenter = require("./update-center").createUpdateCenter({
  app, BrowserWindow: electron.BrowserWindow, ipcMain: electron.ipcMain, Notification: electron.Notification,
  getWorkspaceUrl: () => profileRuntime?.web_url,
  onResume: () => updates.check(true),
});
const updates = require("./updates").createUpdates({
  app,
  dialog: updateCenter,
  progress: updateCenter.progress,
  powerMonitor: electron.powerMonitor,
  runtimeUpdates,
  Menu: electron.Menu,
  autoUpdater: require("electron-updater").autoUpdater,
  enabled: require("../package.json").integralOneUpdates?.enabled === true,
  channel: require("../package.json").integralOneUpdates.channel,
  currentCore: require("../distribution.json").core,
  request: (url, options) => electron.net.fetch(url, options),
  prepareForInstall: () => require("./update-backup").prepareUpdate(host, app.getPath("userData")),
});
host = require("@integral/desktop-host").runDesktop({
  productName: "Integral One",
  windowTitle: "Integral | one",
  mode: "local",
  userDataName: "Integral",
  singleInstanceDataName: "Integral",
  iconRoot: path.join(__dirname, "icons"),
  windowsTitleBar: true,
  resources,
  workspacePreload: path.join(__dirname, "workspace-preload.js"),
  helpMenuItems: updates.menuItems,
  updates: { state: updates.snapshot, check: () => updateCenter.resume(), subscribe: updates.subscribe },
  onReady: updates.start,
  beforeBoot: async context => { await accountController().beforeBoot(context); await runtimeUpdates.beforeBoot(context); },
  beforeWorkspace: ({ runtime }) => prepareProfile(runtime),
  account: {
    profile: () => accountController().accountProfile(),
    authorizeSession: (...args) => accountController().authorizeSession(...args),
    signOut: () => accountController().signOut(),
    signIn: async () => { await accountController().signIn(); await prepareProfile(); },
    resumeOffline: () => accountController().resumeOffline(),
  },
  loadingScreen: {
    title: "Integral | one",
    width: 520,
    height: 350,
    recovery: true,
    backgroundColor: "#171717",
    html: fs.readFileSync(path.join(__dirname, "loading.html"), "utf8"),
  },
});
