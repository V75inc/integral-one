"use strict";
// Exercise the real native signer in ordinary CI, using only an ad hoc identity.
const fs = require("node:fs");
const path = require("node:path");
const { signWithRuntimeManifest } = require("./sign-mac");
async function qualify(directory) {
  if (process.platform !== "darwin") throw new Error("Native signing qualification requires macOS.");
  const apps = fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    const folder = path.join(directory, item.name);
    if (!item.isDirectory() || item.isSymbolicLink()) return [];
    return fs.readdirSync(folder).filter(name => name.endsWith(".app")).map(name => path.join(folder, name));
  });
  if (apps.length !== 1) throw new Error("Require one unpacked macOS candidate.");
  await signWithRuntimeManifest({ app: apps[0], platform: "darwin", identity: "-", identityValidation: false,
    type: "development", strictVerify: true, preAutoEntitlements: false,
    optionsForFile: () => ({ entitlements: path.join(__dirname, "../desktop/build/entitlements.mac.plist"), hardenedRuntime: true, timestamp: "none" }) });
  await require("./qualify-runtime").qualifyRuntime(path.join(apps[0], "Contents", "Resources"));
  console.log("Native ad hoc signing: child launcher digest and final application resource seal verified. Developer ID/notarization remain separate.");
}
if (require.main === module) qualify(path.resolve(process.argv[2] || "release")).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { qualify };
