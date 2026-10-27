"use strict";
// Actual Core processes and stores; only the unpublished GitHub payload transport
// and app relaunch are supplied by this task-owned qualification harness.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const { invocation, startCore, runCli } = require("@integral/desktop-host/core-runtime");
const { localSession } = require("@integral/desktop-host/local-session");
const { backupRuntime } = require("@integral/desktop-host/update-backup");
const { createRuntimeManager, identity } = require("../desktop/runtime-updates/manager");
const { prepareUpdate } = require("../desktop/update-backup");
const { loadState, privateFile } = require("../desktop/accounts/receipt");
const { verifyLogtoSetup, ISSUER } = require("../desktop/accounts/logto-setup");
const { createProfileInitializer } = require("../desktop/accounts/local-profile");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function qualify(payloadDirectory, baselineDirectory, output) {
  if (fs.existsSync(output)) throw new Error("Use a fresh qualification directory; existing evidence is retained.");
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const [name, leaf] of [["UV_CACHE_DIR", "cache"], ["UV_PYTHON_INSTALL_DIR", "python"], ["UV_PYTHON_BIN_DIR", "bin"], ["UV_TOOL_DIR", "tools"]]) process.env[name] = path.join(output, "managed", leaf);
  const manifest = JSON.parse(fs.readFileSync(path.join(payloadDirectory, "runtime-manifest.json"))), bundled = path.resolve(__dirname, "../resources");
  const baselines = fs.readdirSync(baselineDirectory).filter(name => /^integral_core-\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?-py3-none-any.whl$/.test(name));
  assert.equal(baselines.length, 1);
  const baselineVersion = baselines[0].slice("integral_core-".length, -"-py3-none-any.whl".length);
  assert.ok(require("../desktop/release-contract").compareCore(manifest.core.version, baselineVersion) > 0);
  invocation({ resources: bundled, command: "", prefix: "" }); // Verify the reviewed platform uv and bundled wheel first.
  const resources = path.join(output, "unchanged-host-resources"), core = path.join(resources, "core"); fs.mkdirSync(core, { recursive: true });
  const uv = process.platform === "win32" ? "uv.exe" : "uv";
  fs.copyFileSync(path.join(bundled, "core", uv), path.join(core, uv)); fs.chmodSync(path.join(core, uv), 0o700);
  fs.copyFileSync(path.join(baselineDirectory, baselines[0]), path.join(core, baselines[0]));
  const descriptor = JSON.parse(fs.readFileSync(path.join(bundled, "core/runtime.json")));
  descriptor.coreWheel = baselines[0]; descriptor.sha256 = { [baselines[0]]: hash(path.join(core, baselines[0])), uv: hash(path.join(core, uv)) };
  fs.writeFileSync(path.join(core, "runtime.json"), JSON.stringify(descriptor));
  const originalResources = Object.fromEntries(fs.readdirSync(core).map(name => [name, hash(path.join(core, name))]));
  const payloadUrl = `https://github.com/V75inc/integral-one/releases/download/core-v${manifest.core.version}/${manifest.payload.file}`;
  const request = async (url, options) => String(url) === payloadUrl ? new Response(fs.readFileSync(path.join(payloadDirectory, manifest.payload.file))) : fetch(url, options);
  const candidate = { manifest, url: payloadUrl };
  const results = [];
  async function runScenario(name, failTrial = false) {
    const userData = path.join(output, name), home = path.join(userData, "core"), environment = {};
    let runtime, manager, relaunches = 0;
    const app = { isPackaged: true, getVersion: () => require("../package.json").version, relaunch: () => { relaunches++; }, quit() {} };
    const stop = async () => {
      if (!runtime?.owned) return;
      const status = await runCli(runtime.cli, ["stop", "--home", home, "--json", "--if-pid", String(runtime.pid), "--if-created", String(runtime.process_created)]);
      assert.equal(status.state, "stopped"); runtime.owned = false; runtime.stopped = true;
    };
    const config = { app, resources, channel: manifest.channel, bundledCore: { version: baselineVersion }, request, environment,
      argv: ["qualification", "--home=" + home, "--user-data-dir=" + userData], getRuntime: () => runtime,
      prepareForInstall: () => prepareUpdate({ prepareUpdate: ({ backupDirectory }) => backupRuntime({ runtime, directory: backupDirectory, runCli, stop }) }, userData),
      ...(failTrial ? { start: async () => { fs.writeFileSync(path.join(home, "rollback-probe"), "partial trial"); throw Error("Injected candidate startup failure"); } } : {}),
    };
    const cli = () => ({ file: environment.INTEGRAL_CORE_COMMAND, args: JSON.parse(environment.INTEGRAL_CORE_ARGS) });
    const api = async (route, method = "GET", body) => {
      const session = await localSession(runtime);
      const response = await fetch(new URL(route, runtime.web_url), { method, redirect: "error", signal: AbortSignal.timeout(20_000),
        headers: { Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.ok(response.ok, "Synthetic runtime API failed: " + response.status); return response.json();
    };
    try {
      manager = createRuntimeManager(config); await manager.beforeBoot({ userData });
      runtime = await startCore({ home, resources, command: cli() }); assert.ok(runtime.owned);
      const account = loadState(home), key = crypto.generateKeyPairSync("ed25519").privateKey;
      const profile = { name: "Runtime update fixture", email: "runtime@example.invalid" };
      const payload = Buffer.from(JSON.stringify({ v: 3, product: "integral-one", installation_id: account.installationId, issuer: ISSUER, sub: "independent-runtime-fixture", completed_at: new Date().toISOString(), profile })).toString("base64url");
      privateFile(path.join(home, "one-account/setup-key.json"), { privateKey: key.export({ format: "pem", type: "pkcs8" }) });
      privateFile(path.join(home, "one-account/activation.json"), { ...account, signedOut: false, localSetup: { payload, signature: crypto.sign(null, Buffer.from(payload), key).toString("base64url") } });
      verifyLogtoSetup(home, loadState(home));
      const initialize = () => createProfileInitializer({ getProfile: () => profile, authorize() {} })(runtime);
      await initialize(); await api("/api/auth/update-profile", "PUT", { display_name: "Chosen runtime update name" });
      const appData = await api("/api/apps", "POST", { name: "Independent update fixture" }), appId = (appData.app || appData).id;
      const trackData = await api("/api/tracks", "POST", { title: "Runtime update retention", app_id: appId, visibility: "private" }), trackId = (trackData.track || trackData).id;
      const entryData = await api("/api/entries", "POST", { title: "Retain this record", body: "Independent Core runtime continuity", track_id: trackId }), entryId = (entryData.entry || entryData).id;
      await api("/api/users/me/timezone", "PATCH", { timezone: "America/Guyana" }); await api("/api/users/me/pinned", "POST", { kind: "app", id: appId, pinned: true });
      fs.writeFileSync(path.join(home, "rollback-probe"), "original");
      const originalIdentity = identity(home), installationId = runtime.installation_id;
      await manager.stage(candidate);
      assert.equal(manager.currentCore(), baselineVersion); assert.equal(relaunches, 0);
      await manager.install(); assert.equal(relaunches, 1);
      manager = createRuntimeManager(config); await manager.beforeBoot({ userData });
      assert.equal(manager.currentCore(), failTrial ? baselineVersion : manifest.core.version);
      runtime = await startCore({ home, resources, command: cli() }); assert.ok(runtime.owned);
      async function retained() {
        assert.equal(runtime.installation_id, installationId); assert.deepEqual(identity(home), originalIdentity);
        verifyLogtoSetup(home, loadState(home)); await initialize();
        const me = await api("/api/auth/me"); assert.equal((me.user || me).display_name, "Chosen runtime update name");
        const entry = await api("/api/entries/" + entryId); assert.equal((entry.entry || entry).body, "Independent Core runtime continuity");
        assert.equal((await api("/api/users/me/timezone")).timezone, "America/Guyana"); assert.ok((await api("/api/users/me/pinned")).pinned.apps.includes(appId));
      }
      await retained();
      if (failTrial) {
        assert.ok(manager.recovery()); assert.equal(fs.readFileSync(path.join(home, "rollback-probe"), "utf8"), "original");
        assert.equal(fs.readFileSync(path.join(manager.recovery().retainedHome, "rollback-probe"), "utf8"), "partial trial");
      }
      await stop(); manager = createRuntimeManager(config); await manager.beforeBoot({ userData });
      runtime = await startCore({ home, resources, command: cli() }); await retained();
      const row = { result: "pass", scenario: name, from: baselineVersion, core: runtime.version, stagedWithoutInstall:true,
        consentRequired: true, coldBackup: true, accountKeysRecordNameTimezonePinRetained: true, coldRestart: true,
        ...(failTrial ? { failedTrialRestoredPreviousRuntimeAndHome: true, failedCopyRetained: true } : { independentRuntimeActivated: true }) };
      results.push(row); console.log(JSON.stringify(row));
    } finally { await stop(); }
  }
  await runScenario("success"); await runScenario("failed-trial", true);
  assert.deepEqual(Object.fromEntries(fs.readdirSync(core).map(name => [name, hash(path.join(core, name))])), originalResources);
  const result = { result: "pass", at: new Date().toISOString(), hostVersion: require("../package.json").version,
    desktopRuntimeResourcesUnchanged: true, realTestPyPiAndPublishedEngineVerification: true,
    transportScope: "Only unpublished GitHub payload transport and app relaunch are supplied externally; real Core processes, package downloads, integrity checks, backup and recovery logic execute.", scenarios: results };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  return result;
}
module.exports = { qualify };
if (require.main === module) {
  if (process.argv.length !== 5) throw Error("Usage: node scripts/qualify-independent-runtime.js <payload-directory> <baseline-wheel-directory> <fresh-report-directory>");
  qualify(...process.argv.slice(2).map(value => path.resolve(value))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
