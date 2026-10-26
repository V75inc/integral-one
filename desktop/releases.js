"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const { APP_VERSION, SHA256, REPOSITORY, coreVersion, compareCore, compareApp, channelPolicy, validateManifest } = require("./release-contract");

const RELEASES_API = "https://api.github.com/repos/V75inc/integral-one/releases?per_page=30";
const ASSET_HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);

// No account tokens, cookies, installation identifiers or arbitrary feed URLs.
async function publicJson(url, { request = fetch, limit = 65536, asset = false, missing = false } = {}) {
  let current = new URL(url);
  for (let hop = 0; hop < 5; hop++) {
    if (current.protocol !== "https:" || current.username || current.password ||
        (hop && (!asset || !ASSET_HOSTS.has(current.hostname)))) throw new Error("Invalid release download origin.");
    const response = await request(current.href, { redirect: "manual", credentials: "omit",
      headers: { Accept: "application/json", "User-Agent": "Integral-One-release-check" }, signal: AbortSignal.timeout(20000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!asset || !location) throw new Error("Unexpected release redirect.");
      current = new URL(location, current);
      continue;
    }
    if (missing && response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok || response.redirected) { await response.body?.cancel(); throw new Error("Release check failed."); }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error("Release metadata exceeded its limit.");
        chunks.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { await reader.cancel(); }
  }
  throw new Error("Too many release redirects.");
}

function publication(files, version) {
  if (!Array.isArray(files)) return null;
  const eligible = files.filter(file => file && file.filename === `integral_core-${version}-py3-none-any.whl` &&
    file.packagetype === "bdist_wheel" && !file.yanked && SHA256.test(file.digests?.sha256) &&
    Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 64 * 1024 ** 2);
  return eligible.length === 1 ? eligible[0] : null;
}

async function discoverUpdates({ currentCore, currentVersion, channel, platform, arch, request = fetch }) {
  const policy = channelPolicy(channel);
  coreVersion(currentCore);
  const metadata = await publicJson(`${policy.index}/pypi/integral-core/json`, { request, limit: 8 * 1024 ** 2, missing: true });
  const publications = new Map();
  for (const [version, files] of Object.entries(metadata?.releases || {})) {
    let key;
    try { key = coreVersion(version); } catch { continue; }
    if (!policy.prereleases && key[3] !== 3) continue;
    const wheel = publication(files, version);
    if (wheel) publications.set(version, wheel.digests.sha256);
  }
  const latestCore = [...publications.keys()].sort((a, b) => compareCore(b, a))[0] || null;
  const result = { latestCore, registry: policy.registry, channel, candidate: null };
  // A missing stable package is a normal state while One is in development.
  if (!publications.size) return result;
  const releases = await publicJson(RELEASES_API, { request, limit: 2 * 1024 ** 2 });
  if (!Array.isArray(releases)) throw new Error("Invalid One release index.");
  const candidates = releases.filter(release => release && release.draft === false &&
    release.prerelease === policy.prereleases && /^v\d+\.\d+\.\d+$/.test(release.tag_name) &&
    compareApp(release.tag_name.slice(1), currentVersion) > 0 &&
    Array.isArray(release.assets) && release.assets.some(asset => asset.name === "install-manifest.json"))
    .sort((a, b) => compareApp(b.tag_name.slice(1), a.tag_name.slice(1))).slice(0, 5);
  for (const release of candidates) {
    const feedUrl = `${REPOSITORY}/releases/download/${release.tag_name}/`;
    const manifest = validateManifest(await publicJson(`${feedUrl}install-manifest.json`, { request, asset: true }));
    if (manifest.version !== release.tag_name.slice(1) || manifest.channel !== channel) throw new Error("One release channel/version mismatch.");
    const asset = manifest.artifacts[`${platform}-${arch}`];
    if (!asset || compareCore(manifest.core.version, currentCore) < 0) continue;
    if (manifest.core.registry !== policy.registry || publications.get(manifest.core.version) !== manifest.core.wheelSha256)
      throw new Error("One installer does not match a published Core wheel.");
    const required = [asset.file, platform === "darwin" ? "latest-mac.yml" : "latest.yml"];
    if (!required.every(name => release.assets.some(file => file.name === name))) continue;
    return { ...result, candidate: { manifest, asset, feedUrl } };
  }
  return result;
}

function verifyUpdateInfo(info, candidate) {
  const { manifest, asset } = candidate;
  if (!info || !APP_VERSION.test(info.version) || info.version !== manifest.version ||
      info.releaseChannel !== manifest.channel || info.integralCore?.version !== manifest.core.version ||
      info.integralCore?.registry !== manifest.core.registry || info.integralCore?.wheelSha256 !== manifest.core.wheelSha256 ||
      !Array.isArray(info.files) || !info.files.some(file => file.url === asset.file && file.size === asset.bytes))
    throw new Error("Update feed does not match the qualified One release.");
  for (const file of info.files) {
    if (!Object.values(manifest.artifacts).some(asset => asset.file === file.url && asset.bytes === file.size))
      throw new Error("Unexpected update download.");
  }
}

async function verifyDownload(files, asset) {
  if (!Array.isArray(files) || !files.length) throw new Error("Update download is missing.");
  for (const file of files) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== asset.bytes) continue;
    const hash = crypto.createHash("sha256");
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    if (hash.digest("hex") === asset.sha256) return;
  }
  throw new Error("Downloaded installer differs from the qualified release.");
}

module.exports = { RELEASES_API, publicJson, publication, discoverUpdates, verifyUpdateInfo, verifyDownload };
