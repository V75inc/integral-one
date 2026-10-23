"use strict";
const path = require("node:path");
const fs = require("node:fs");
const electron = require("electron");
const { app } = electron;
const config = require("./accounts/config").loadConfig();
const { createController } = require("./accounts/controller");
const controller = createController({
  electron,
  config,
  createBridge: require("@clerk/electron").createClerkBridge,
});
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
const updates = require("./updates").createUpdates({
  app,
  dialog: electron.dialog,
  Menu: electron.Menu,
  autoUpdater: require("electron-updater").autoUpdater,
  production: config.configured && config.environment === "production" &&
    require("../package.json").integralOneUpdates?.enabled === true,
  prepareForInstall: () => host.stopRuntime({ requireExclusive: true }),
});
host = require("@integral/desktop-host").runDesktop({
  productName: "Integral One",
  windowTitle: "Integral | one",
  mode: "local",
  userDataName: "Integral",
  iconRoot: path.join(__dirname, "icons"),
  windowsTitleBar: true,
  resources,
  helpMenuItems: updates.menuItems,
  onReady: updates.start,
  beforeBoot: controller.beforeBoot,
  account: {
    profile: controller.accountProfile,
    authorizeSession: controller.authorizeSession,
    signOut: controller.signOut,
    signIn: controller.signIn,
    resumeOffline: controller.resumeOffline,
  },
  loadingScreen: {
    title: "Integral | one",
    width: 520,
    height: 330,
    backgroundColor: "#171717",
    html: fs.readFileSync(path.join(__dirname, "loading.html"), "utf8"),
  },
});
