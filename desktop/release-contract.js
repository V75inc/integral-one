"use strict";

const CORE_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:(a|b|rc)(\d+))?$/;
const APP_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = "https://github.com/V75inc/integral-one";

function coreVersion(value) {
  const match = typeof value === "string" && CORE_VERSION.exec(value);
  if (!match) throw new Error("Invalid Core version.");
  const [, major, minor, patch, kind, number] = match;
  const result = [+major, +minor, +patch, { a: 0, b: 1, rc: 2, undefined: 3 }[kind], +(number || 0)];
  if (!result.every(Number.isSafeInteger)) throw new Error("Invalid Core version.");
  return result;
}
function compare(left, right) {
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function compareCore(left, right) { return compare(coreVersion(left), coreVersion(right)); }
function compareApp(left, right) {
  if (!APP_VERSION.test(left) || !APP_VERSION.test(right)) throw new Error("Invalid One version.");
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  if (![...a, ...b].every(Number.isSafeInteger)) throw new Error("Invalid One version.");
  return compare(a, b);
}
function channelPolicy(channel) {
  if (channel === "stable") return { registry: "pypi", index: "https://pypi.org", prereleases: false };
  if (channel === "development") return { registry: "testpypi", index: "https://test.pypi.org", prereleases: true };
  throw new Error("Invalid update channel.");
}
function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 2 || !APP_VERSION.test(manifest.version)) throw new Error("Unsupported installer manifest.");
  compareApp(manifest.version, manifest.version);
  const policy = channelPolicy(manifest.channel);
  const core = manifest.core;
  const version = coreVersion(core?.version);
  if (core.registry !== policy.registry || !SHA256.test(core.wheelSha256) || (!policy.prereleases && version[3] !== 3))
    throw new Error("Installer Core release does not match its channel.");
  const names = {
    "darwin-arm64": `integral-one-${manifest.version}-mac-arm64.zip`,
    "darwin-x64": `integral-one-${manifest.version}-mac-x64.zip`,
    "win32-x64": `integral-one-${manifest.version}-win-x64.exe`,
  };
  const entries = Object.entries(manifest.artifacts || {});
  if (!entries.length) throw new Error("Manifest has no installers.");
  for (const [platform, asset] of entries) {
    if (!asset || !names[platform] || asset.file !== names[platform] || !SHA256.test(asset.sha256) ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 4 * 1024 ** 3)
      throw new Error("Invalid installer identity/checksum/size.");
    if (platform.startsWith("darwin") ? asset.appleTeamId !== "M43V972XU9" :
      (!/^[A-F0-9]{40}$/.test(asset.signerThumbprint) || asset.publisherName !== "V75 Inc."))
      throw new Error("Missing verified publisher identity.");
  }
  return manifest;
}

module.exports = { APP_VERSION, SHA256, REPOSITORY, coreVersion, compareCore, compareApp, channelPolicy, validateManifest };
