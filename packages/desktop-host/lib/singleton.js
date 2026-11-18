"use strict";
const path = require("node:path");
function requestDesktopLock(app, lockPath) {
  if (!lockPath) return app.requestSingleInstanceLock();
  if (typeof lockPath !== "string" || !path.isAbsolute(lockPath)) throw new Error("Invalid product singleton path.");
  const profile = app.getPath("userData");
  try {
    app.setPath("userData", lockPath);
    return app.requestSingleInstanceLock();
  } finally {
    // Only lock scope changes; account, workspace and cache paths remain the
    // selected profile. No home is switched and no second lock is requested.
    app.setPath("userData", profile);
  }
}
module.exports = { requestDesktopLock };
