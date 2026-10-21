"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function plainFile(base, name) {
  if (typeof name !== "string" || !name || path.basename(name) !== name || /[\\/]/.test(name))
    throw new Error("Invalid signed runtime path.");
  for (const file of [base, path.join(base, name)]) {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error("Signed runtime symlinks are forbidden.");
  }
  const file = path.join(base, name);
  if (!fs.statSync(file).isFile()) throw new Error("Missing signed runtime file.");
  return file;
}

async function signWithRuntimeManifest(options, {
  sign = opts => require("@electron/osx-sign").signAsync(opts),
  verify = file => execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", file], { stdio: "pipe" }),
} = {}) {
  if (options.platform !== "darwin" || !options.identity)
    throw new Error("One signing requires a macOS application and explicit identity.");
  const app = path.resolve(options.app);
  const base = path.join(app, "Contents", "Resources", "core");
  // Validate the approved input before the signer is permitted to rewrite Mach-O bytes.
  for (const folder of [app, path.join(app, "Contents"), path.join(app, "Contents", "Resources"), base]) {
    if (!fs.lstatSync(folder).isDirectory() || fs.lstatSync(folder).isSymbolicLink())
      throw new Error("Invalid signed application directory.");
  }
  const manifestFile = plainFile(base, "runtime.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.contract_version !== 1 || manifest.runtime_contract_version !== 1 ||
      manifest.runtime_preset !== "local" || manifest.platform !== "darwin" ||
      !["arm64", "x64"].includes(manifest.arch) || !manifest.coreWheel?.endsWith(".whl"))
    throw new Error("Invalid signing runtime manifest.");
  const uv = plainFile(base, "uv"), wheel = plainFile(base, manifest.coreWheel);
  if (hash(uv) !== manifest.sha256?.uv || hash(wheel) !== manifest.sha256?.[manifest.coreWheel])
    throw new Error("Runtime changed before signing.");
  let launcherVisited = false, sealedHash = null;
  const original = options.optionsForFile;
  await sign({ ...options, optionsForFile(file) {
    const resolved = path.resolve(file);
    if (resolved === uv) launcherVisited = true;
    if (resolved === app) {
      // osx-sign awaits every child signature before requesting options for the
      // outer app. Update the digest here, before its resource seal is produced.
      if (!launcherVisited) throw new Error("The signer skipped the native runtime launcher.");
      if (hash(wheel) !== manifest.sha256[manifest.coreWheel]) throw new Error("Core wheel changed while signing.");
      verify(uv);
      sealedHash = hash(uv);
      manifest.sha256.uv = sealedHash;
      const temp = path.join(base, `.runtime-${crypto.randomUUID()}.tmp`);
      try {
        fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o644 });
        fs.renameSync(temp, manifestFile);
      } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      }
    }
    return original ? original(file) : undefined;
  } });
  if (!sealedHash || hash(uv) !== sealedHash || hash(wheel) !== manifest.sha256[manifest.coreWheel] ||
      JSON.parse(fs.readFileSync(manifestFile, "utf8")).sha256.uv !== sealedHash)
    throw new Error("Signed runtime changed after the application seal.");
  verify(app);
}

module.exports = options => signWithRuntimeManifest(options);
module.exports.signWithRuntimeManifest = signWithRuntimeManifest;
