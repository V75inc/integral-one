"use strict";
// Actual app-replacement path, restricted to a fresh synthetic installation.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { invocation, startCore, runCli } = require("@integral/desktop-host/core-runtime");
const { localSession } = require("@integral/desktop-host/local-session");
const { privateFile, loadState } = require("../desktop/accounts/receipt");
const { verifyLogtoSetup: verifyAccount, ISSUER: issuer } = require("../desktop/accounts/logto-setup");
const { runtimeDiagnostics } = require("./qualify-runtime");
const { backupRuntime } = require("@integral/desktop-host/update-backup");
const { prepareUpdate } = require("../desktop/update-backup");

// Core's `integral up` gives itself 180s. A cold Windows runner can miss that
// window once and succeed on the next start. One retry is the bound; a second
// miss still fails the qualification.
async function startOrRetry(start, stop, options) {
  try {
    return await start(options);
  } catch (error) {
    if (!String(error && error.message).includes("Startup timed out")) throw error;
    console.error(runtimeDiagnostics(options.home));
    console.error("Synthetic runtime startup timed out; stopping and retrying once.");
    try {
      await stop(options.command, ["stop", "--home", options.home, "--json"]);
    } catch {
      /* The timed-out start already asks Core to stop. */
    }
    return await start(options);
  }
}

async function qualify(directory, { requireSettings = false } = {}) {
  const baseline = fs.readdirSync(directory).filter(name => /^integral_core-\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?-py3-none-any\.whl$/.test(name));
  assert.equal(baseline.length, 1, "Require one exact previous Core wheel");
  const resources = path.join(__dirname, "../resources");
  const current = invocation({ resources, command: "", prefix: "" });
  const prior = { file: current.file, args: ["tool", "run", "--python", "3.12", "--index-url", "https://pypi.org/simple", "--from", path.resolve(directory, baseline[0]), "integral"] };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "one-upgrade-")), home = path.join(root, "store");
  let cleanupCommand = prior;
  const json = file => JSON.parse(fs.readFileSync(file, "utf8"));
  const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
  const privateKeys = () => Object.entries(json(path.join(home, "installation.json")))
    .filter(([key, value]) => /key|token|password|secret/i.test(key) && typeof value === "string")
    .map(([key, value]) => [key, hash(Buffer.from(value))]);
  async function api(runtime, session, route, method = "GET", body) {
    const response = await fetch(new URL(route, runtime.web_url), { method,
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Synthetic upgrade API failed: ${method} ${route} (${response.status})`);
    return response.json();
  }
  try {
    const start = options => startOrRetry(startCore, runCli, options);
    const oldRuntime = await start({ home, resources, command: prior });
    const oldSession = await localSession(oldRuntime);
    const appResult = await api(oldRuntime, oldSession, "/api/apps", "POST", { name: "Upgrade retention fixture" });
    const app = appResult.app || appResult;
    const trackResult = await api(oldRuntime, oldSession, "/api/tracks", "POST", { title: "Upgrade records", app_id: app.id, visibility: "private" });
    const track = trackResult.track || trackResult;
    const entryResult = await api(oldRuntime, oldSession, "/api/entries", "POST", { track_id: track.id, title: "Retain this exact record", body: "Synthetic upgrade continuity" });
    const entry = entryResult.entry || entryResult;
    assert.ok(app.id && track.id && entry.id, "Synthetic records must have identifiers");
    const state = loadState(home), key = crypto.generateKeyPairSync("ed25519").privateKey;
    const payload = Buffer.from(JSON.stringify({ v: 3, product: "integral-one", installation_id: state.installationId,
      issuer, sub: "upgradefixture", completed_at: new Date().toISOString(), profile: { email: "upgrade@example.invalid", name: "Upgrade fixture" } })).toString("base64url");
    privateFile(path.join(home, "one-account/setup-key.json"), { privateKey: key.export({ format: "pem", type: "pkcs8" }) });
    privateFile(path.join(home, "one-account/activation.json"), { ...state, signedOut: false,
      localSetup: { payload, signature: crypto.sign(null, Buffer.from(payload), key).toString("base64url") } });
    verifyAccount(home, loadState(home));
    const keysBefore = privateKeys(), accountBefore = ["activation.json", "setup-key.json"].map(name => hash(fs.readFileSync(path.join(home, "one-account", name))));
    const backupDirectory = await prepareUpdate({ prepareUpdate: ({ backupDirectory }) => backupRuntime({
      runtime: oldRuntime, directory: backupDirectory, runCli,
      stop: async ({ requireExclusive }) => {
        assert.equal(requireExclusive, true);
        assert.equal(oldRuntime.owned, true);
        const stopped = await runCli(prior, ["stop", "--home", home, "--json", "--if-pid", String(oldRuntime.pid), "--if-created", String(oldRuntime.process_created)]);
        assert.equal(stopped.state, "stopped");
        oldRuntime.owned = false; oldRuntime.stopped = true;
      },
    }) }, root);
    assert.ok(fs.statSync(path.join(backupDirectory, "core.tar.gz")).size > 0, "A cold backup must precede engine replacement");
    assert.deepEqual(["activation.json", "setup-key.json"].map(name => hash(fs.readFileSync(path.join(backupDirectory, "one-account", name)))), accountBefore);
    cleanupCommand = current;
    const next = await start({ home, resources, command: current });
    assert.equal(next.version, require("../distribution.json").core.version, "Replacement must run the new pinned engine");
    assert.equal(next.installation_id, oldRuntime.installation_id);
    assert.deepEqual(privateKeys(), keysBefore, "Installation keys changed across replacement");
    const session = await localSession(next);
    const retainedResult = await api(next, session, `/api/entries/${entry.id}`);
    const retained = retainedResult.entry || retainedResult;
    assert.equal(retained.id, entry.id); assert.equal(retained.title, "Retain this exact record");
    assert.equal(retained.body, "Synthetic upgrade continuity");
    assert.deepEqual(["activation.json", "setup-key.json"].map(name => hash(fs.readFileSync(path.join(home, "one-account", name)))), accountBefore);
    verifyAccount(home, loadState(home));
    if (requireSettings) {
      await api(next, session, "/api/users/me/timezone", "PATCH", { timezone: "America/Guyana" });
      await api(next, session, "/api/users/me/pinned", "POST", { kind: "app", id: app.id, pinned: true });
      const timezone = await api(next, session, "/api/users/me/timezone");
      const pins = await api(next, session, "/api/users/me/pinned");
      assert.equal(timezone.timezone, "America/Guyana");
      assert.ok(pins.pinned.apps.includes(app.id), "The installed app must retain a pinned App");
      // Invalid credentials must reach normal request validation, not be blocked
      // by the desktop transport. No provider key or online model is required.
      const invalid = await fetch(new URL("/api/users/me/model-credentials", next.web_url), {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(30_000), redirect: "error",
      });
      assert.ok([400, 422].includes(invalid.status), "Desktop model setup is unavailable or accepts invalid credentials");
      assert.equal((await runCli(current, ["stop", "--home", home, "--json"])).state, "stopped");
      const restarted = await start({ home, resources, command: current });
      assert.equal(restarted.installation_id, oldRuntime.installation_id);
      const restartedSession = await localSession(restarted);
      const savedTimezone = await api(restarted, restartedSession, "/api/users/me/timezone");
      const savedPins = await api(restarted, restartedSession, "/api/users/me/pinned");
      assert.equal(savedTimezone.timezone, "America/Guyana");
      assert.ok(savedPins.pinned.apps.includes(app.id), "Pinned App must survive a cold restart");
      const savedEntry = await api(restarted, restartedSession, `/api/entries/${entry.id}`);
      assert.equal((savedEntry.entry || savedEntry).body, "Synthetic upgrade continuity");
      assert.deepEqual(privateKeys(), keysBefore, "Installation keys changed after restart");
      assert.deepEqual(["activation.json", "setup-key.json"].map(name => hash(fs.readFileSync(path.join(home, "one-account", name)))), accountBefore);
      verifyAccount(home, loadState(home));
      console.log("Release desktop settings: timezone, pinning, model setup transport and cold-restart retention passed.");
    }
    console.log("Previous Core → composed One engine: backup, App/Track/record, installation keys, account binding and local session retained.");
  } catch (error) {
    console.error(runtimeDiagnostics(home));
    throw error;
  } finally {
    const stopped = await runCli(cleanupCommand, ["stop", "--home", home, "--json"]);
    assert.equal(stopped.state, "stopped", "Retain synthetic home if shutdown cannot be confirmed");
    fs.rmSync(root, { recursive: true, force: true });
  }
}
module.exports = { qualify, startOrRetry };
if (require.main === module) {
  if (![3, 4].includes(process.argv.length) || (process.argv[3] && process.argv[3] !== "--require-settings"))
    throw new Error("Usage: node scripts/qualify-upgrade.js <previous-Core-wheel-directory> [--require-settings]");
  qualify(path.resolve(process.argv[2]), { requireSettings: process.argv[3] === "--require-settings" }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
