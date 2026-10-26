"use strict";
const fs = require("node:fs");
const path = require("node:path");

async function prepareUpdate(host, userData) {
  const backup = await host.prepareUpdate({ backupDirectory: path.join(userData, "update-backups") });
  const accounts = path.join(backup.home, "one-account");
  let exists = false;
  try { fs.lstatSync(accounts); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (exists) fs.cpSync(accounts, path.join(backup.directory, "one-account"), {
    recursive: true, errorOnExist: true, force: false,
    filter: source => {
      if (fs.lstatSync(source).isSymbolicLink()) throw new Error("Account backup refuses symbolic links.");
      return true;
    },
  });
  return backup.directory;
}
module.exports = { prepareUpdate };
