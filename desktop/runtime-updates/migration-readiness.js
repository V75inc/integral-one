"use strict";
const fs = require("node:fs"), path = require("node:path");
function needsAssistedMigration(home, argv = [], kind = "runtime") {
  if (!home || !fs.existsSync(path.join(home, "postgres"))) return false;
  const file = path.join(home, "installation.json");
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
    throw new Error("Workspace configuration needs review before updating.");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (config.runtime_database_user && config.runtime_database_password) return false;
  // Native shell installers do not forward a reviewed plan through quitAndInstall.
  // Use the separately qualified assisted replacement procedure for these homes.
  if (kind === "installer") return true;
  const plan = argv.some(value => value.startsWith("--storage-plan=") && value.length > 15);
  const approval = argv.some(value => /^--storage-approved-hash=[a-f0-9]{64}$/.test(value));
  // This only selects the existing exact-plan validator. It grants no approval.
  return !(plan && approval);
}
module.exports = { needsAssistedMigration };
