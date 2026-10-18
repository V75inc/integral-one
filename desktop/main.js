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
require("@integral/desktop-host").runDesktop({
  productName: "Integral One",
  windowTitle: "Integral | one",
  mode: "local",
  userDataName: "Integral",
  iconRoot: path.join(__dirname, "icons"),
  resources,
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
