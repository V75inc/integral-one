"use strict";
const fs = require("node:fs");

function hostedSigningRequested(event, enabled = "false") {
  if (!["push", "workflow_dispatch"].includes(event)) throw new Error("Unsupported signing workflow event.");
  if (!["true", "false"].includes(enabled || "false")) throw new Error("Repository variable ONE_CI_SIGNING_ENABLED must be true or false.");
  return event === "workflow_dispatch" || enabled === "true";
}

// Presence checks only: never print, persist, or attempt to use credentials here.
// Hosted runners cannot see the designated signing Mac's login Keychain.
function verifyCiSigning(platform = process.platform, env = process.env) {
  if (platform === "darwin") {
    const required = {
      CSC_LINK: "MACOS_CSC_LINK",
      CSC_KEY_PASSWORD: "MACOS_CSC_KEY_PASSWORD",
      APPLE_ID: "APPLE_ID",
      APPLE_APP_SPECIFIC_PASSWORD: "APPLE_APP_SPECIFIC_PASSWORD",
      APPLE_TEAM_ID: "APPLE_TEAM_ID",
    };
    const missing = Object.entries(required)
      .filter(([name]) => typeof env[name] !== "string" || !env[name].trim())
      .map(([, secret]) => secret);
    if (missing.length) throw new Error(
      `GitHub desktop-release signing is not configured. Missing secrets: ${missing.join(", ")}. ` +
      "Configure the approved CI credential route, or build on the designated Mac using its local Keychain. No signing was attempted.",
    );
  } else if (platform === "win32") {
    if (!/^[A-Fa-f0-9]{40}$/.test(env.ONE_WINDOWS_CERT_SHA1 || "")) throw new Error(
      "Configure desktop-release variable ONE_WINDOWS_CERT_SHA1 and qualify its certificate-store signing provider before enabling Windows signed builds.",
    );
  } else throw new Error("Hosted signed candidates require macOS or Windows.");
}

if (require.main === module) {
  try {
    if (process.argv[2] === "route" && process.argv.length === 3) {
      const hosted = hostedSigningRequested(process.env.GITHUB_EVENT_NAME, process.env.ONE_CI_SIGNING_ENABLED);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `hosted=${hosted}\n`);
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, hosted
        ? "Hosted signing requested. The protected desktop-release environment and credential preflight must pass before signing.\n"
        : "Local Keychain signing is selected. This run will check the pinned runtime targets and will not build a signed artifact. For hosted signing, configure the protected credentials and explicitly dispatch this workflow or opt in with repository variable ONE_CI_SIGNING_ENABLED=true. See docs/INSTALLER-RELEASE.md.\n");
    } else if (process.argv.length === 2) {
      verifyCiSigning();
      console.log("Hosted signing configuration is present; the signed build must still validate the certificate and notarization.");
    } else throw new Error("Usage: node scripts/verify-ci-signing.js [route]");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { verifyCiSigning, hostedSigningRequested };
