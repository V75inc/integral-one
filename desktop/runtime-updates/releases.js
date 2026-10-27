"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const { publicJson, RELEASES_API } = require("../releases");
const { APP_VERSION, SHA256, REPOSITORY, compareApp, compareCore, coreVersion, channelPolicy } = require("../release-contract");
const HOST_CONTRACT = 1;
const FILE_HOSTS = new Set(["files.pythonhosted.org", "test-files.pythonhosted.org"]);
const RELEASE_HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);

function validate(manifest, { oneVersion, channel, platform = process.platform, arch = process.arch }) {
  const policy = channelPolicy(channel);
  if (manifest?.schemaVersion !== 1 || manifest.product !== "integral-one-runtime" || manifest.channel !== channel ||
      !Number.isSafeInteger(manifest.hostContractVersion) || manifest.hostContractVersion < 1 || !APP_VERSION.test(manifest.minimumOneVersion) ||
      !APP_VERSION.test(manifest.maximumOneVersionExclusive) || compareApp(manifest.minimumOneVersion, "0.1.9") < 0 ||
      compareApp(manifest.minimumOneVersion, manifest.maximumOneVersionExclusive) >= 0)
    throw new Error("Invalid runtime host contract.");
  const core = manifest.core, version = coreVersion(core?.version);
  if (core.registry !== policy.registry || !SHA256.test(core.wheelSha256) || (!policy.prereleases && version[3] !== 3) ||
      !Array.isArray(manifest.platforms) || !manifest.platforms.length ||
      manifest.platforms.some(value => !["darwin-arm64", "win32-x64", "linux-x64"].includes(value)))
    throw new Error("Runtime release does not match this platform or channel.");
  const wheel = manifest.wheel, payload = manifest.payload;
  if (wheel?.file !== `integral_core-${core.version}-py3-none-any.whl` || !SHA256.test(wheel.sha256) ||
      payload?.file !== `integral-one-runtime-${core.version}.zip` || !SHA256.test(payload.sha256) ||
      !Number.isSafeInteger(payload.bytes) || payload.bytes < 1 || payload.bytes > 128 * 1024 ** 2 ||
      !/^[a-f0-9]{40}$/.test(manifest.source?.core || "") || !/^[a-f0-9]{40}$/.test(manifest.source?.one || ""))
    throw new Error("Invalid runtime artifact identity.");
  if (manifest.hostContractVersion !== HOST_CONTRACT || !manifest.platforms.includes(`${platform}-${arch}`) ||
      compareApp(oneVersion, manifest.minimumOneVersion) < 0 || compareApp(oneVersion, manifest.maximumOneVersionExclusive) >= 0) {
    const error = new Error("This runtime needs a compatible Integral One desktop update."); error.code = "INCOMPATIBLE_RUNTIME"; throw error;
  }
  return manifest;
}

function publishedWheel(files, core, registry) {
  const host = registry === "testpypi" ? "test-files.pythonhosted.org" : "files.pythonhosted.org";
  const candidates = (files || []).filter(file => file?.filename === `integral_core-${core.version}-py3-none-any.whl` &&
    file.packagetype === "bdist_wheel" && file.yanked === false && file.digests?.sha256 === core.wheelSha256 &&
    Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 64 * 1024 ** 2);
  if (candidates.length !== 1) throw new Error("Runtime Core pin is unavailable, changed or withdrawn.");
  const asset = candidates[0], url = new URL(asset.url);
  if (url.protocol !== "https:" || url.hostname !== host || url.username || url.password || url.search || url.hash)
    throw new Error("Invalid Core package download origin.");
  return asset;
}

async function discover({ currentCore, oneVersion, channel, platform = process.platform, arch = process.arch, request = fetch }) {
  const policy = channelPolicy(channel);
  const metadata = await publicJson(`${policy.index}/pypi/integral-core/json`, { request, limit: 8 * 1024 ** 2, missing: true });
  const eligible = Object.entries(metadata?.releases || {}).filter(([version, files]) => {
    try {
      const key = coreVersion(version), previous = coreVersion(currentCore);
      if (key[0] !== previous[0] || key[1] !== previous[1] || (!policy.prereleases && key[3] !== 3) || compareCore(version, currentCore) <= 0) return false;
      return files.some(file => file.filename === `integral_core-${version}-py3-none-any.whl` && file.packagetype === "bdist_wheel" && !file.yanked);
    } catch { return false; }
  }).sort(([a], [b]) => compareCore(b, a));
  if (!eligible.length) return { latestCore: null, candidate: null };
  const releases = await publicJson(RELEASES_API, { request, limit: 2 * 1024 ** 2 });
  if (!Array.isArray(releases)) throw new Error("Invalid runtime release index.");
  for (const [version, files] of eligible.slice(0, 5)) {
    const release = releases.find(item => item?.tag_name === `core-v${version}` && item.draft === false && item.prerelease === policy.prereleases);
    if (!release || !release.assets?.some(asset => asset.name === "runtime-manifest.json")) continue;
    const base = `${REPOSITORY}/releases/download/core-v${version}/`;
    let manifest;
    try { manifest = validate(await publicJson(base + "runtime-manifest.json", { request, asset: true }), { oneVersion, channel, platform, arch }); }
    catch (error) { if (error.code === "INCOMPATIBLE_RUNTIME") continue; throw error; }
    if (manifest.core.version !== version || !release.assets.some(asset => asset.name === manifest.payload.file))
      throw new Error("Incomplete runtime release.");
    const upstream = publishedWheel(files, manifest.core, policy.registry);
    return { latestCore: eligible[0][0], candidate: { manifest, url: base + manifest.payload.file, upstream } };
  }
  return { latestCore: eligible[0][0], candidate: null };
}

async function download(url, file, { bytes, sha256, packageFile = false, request = fetch, onProgress = () => {} }) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 128 * 1024 ** 2 || !SHA256.test(sha256)) throw new Error("Invalid download bounds.");
  const hosts = packageFile ? FILE_HOSTS : RELEASE_HOSTS;
  let address = new URL(url), response;
  for (let hop = 0; hop < 5; hop++) {
    if (address.protocol !== "https:" || !hosts.has(address.hostname) || address.username || address.password)
      throw new Error("Untrusted runtime download origin.");
    response = await request(address.href, { redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(10 * 60_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location"); await response.body?.cancel();
      if (packageFile || !location) throw new Error("Unexpected package redirect.");
      address = new URL(location, address); response = null; continue;
    }
    break;
  }
  if (!response?.ok || response.redirected || !response.body) throw new Error("Runtime download failed.");
  const reader = response.body.getReader(), hash = crypto.createHash("sha256"), handle = fs.openSync(file, "wx", 0o600);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > bytes) throw new Error("Runtime download exceeded its expected size.");
      hash.update(value); fs.writeFileSync(handle, value); onProgress(Math.floor(size / bytes * 100));
    }
    if (size !== bytes || hash.digest("hex") !== sha256) throw new Error("Runtime download checksum mismatch.");
  } catch (error) { fs.closeSync(handle); fs.rmSync(file, { force: true }); throw error; }
  finally { await reader.cancel().catch(() => {}); }
  fs.closeSync(handle);
}

module.exports = { HOST_CONTRACT, validate, publishedWheel, discover, download };
