"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const yaml = require("js-yaml");
const { validatePart } = require("./installer-manifest");
function generate(directory, version) {
  const manifest = validatePart(JSON.parse(fs.readFileSync(path.join(directory, "install-manifest.json"), "utf8")));
  if (manifest.version !== version) throw new Error("Update and installer versions must match.");
  if (!manifest.artifacts["darwin-arm64"]) throw new Error("The qualified Apple Silicon installer is required for updates.");
  const files = ["darwin-arm64", "darwin-x64"].filter(platform => manifest.artifacts[platform]).map(platform => {
    const artifact = manifest.artifacts[platform];
    if (!artifact || artifact.appleTeamId !== "M43V972XU9")
      throw new Error("A verified V75 Mac installer is required for updates.");
    const file = path.join(directory, artifact.file);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error("Invalid update artifact.");
    const bytes = fs.readFileSync(file);
    if (bytes.length !== artifact.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
      throw new Error("Update artifact differs from the verified installer.");
    return { url: artifact.file, sha512: crypto.createHash("sha512").update(bytes).digest("base64"), size: bytes.length };
  });
  const primary = files.find(file => /-x64\.zip$/.test(file.url)) || files[0];
  const metadata = { version, integralCore: manifest.core, releaseChannel: manifest.channel,
    files, path: primary.url, sha512: primary.sha512, releaseDate: new Date().toISOString() };
  fs.writeFileSync(path.join(directory, "latest-mac.yml"), yaml.dump(metadata));
  const windows = manifest.artifacts['win32-x64'];
  if (windows) {
    const file = path.join(directory, windows.file), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid Windows update artifact.');
    const bytes = fs.readFileSync(file);
    if (bytes.length !== windows.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== windows.sha256)
      throw new Error('Windows update artifact differs from the verified installer.');
    const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
    fs.writeFileSync(path.join(directory, 'latest.yml'), yaml.dump({ version, integralCore: manifest.core,
      releaseChannel: manifest.channel, files: [{ url: windows.file, sha512, size: bytes.length }],
      path: windows.file, sha512, releaseDate: metadata.releaseDate }));
  }
  return metadata;
}
if (require.main === module) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/update-metadata.js <verified-release-directory>");
  generate(path.resolve(process.argv[2]), require("../package.json").version);
  console.log("Created latest-mac.yml from the verified Mac installers. Publish with the exact matching ZIPs.");
}
module.exports = { generate };
