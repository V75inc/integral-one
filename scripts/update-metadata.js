"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const yaml = require("js-yaml");
const { validatePart } = require("./installer-manifest");
function generate(directory, version) {
  const manifest = validatePart(JSON.parse(fs.readFileSync(path.join(directory, "install-manifest.json"), "utf8")));
  if (manifest.version !== version) throw new Error("Update and installer versions must match.");
  const files = ["darwin-arm64", "darwin-x64"].map(platform => {
    const artifact = manifest.artifacts[platform];
    if (!artifact || artifact.appleTeamId !== "M43V972XU9")
      throw new Error("Both verified V75 Mac installers are required for updates.");
    const file = path.join(directory, artifact.file);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error("Invalid update artifact.");
    const bytes = fs.readFileSync(file);
    if (bytes.length !== artifact.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
      throw new Error("Update artifact differs from the verified installer.");
    return { url: artifact.file, sha512: crypto.createHash("sha512").update(bytes).digest("base64"), size: bytes.length };
  });
  const intel = files[1];
  const metadata = { version, files, path: intel.url, sha512: intel.sha512, releaseDate: new Date().toISOString() };
  fs.writeFileSync(path.join(directory, "latest-mac.yml"), yaml.dump(metadata));
  return metadata;
}
if (require.main === module) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/update-metadata.js <verified-release-directory>");
  generate(path.resolve(process.argv[2]), require("../package.json").version);
  console.log("Created latest-mac.yml from both verified Mac installers. Publish with the exact matching ZIPs.");
}
module.exports = { generate };
