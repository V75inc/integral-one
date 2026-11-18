"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify, isDeepStrictEqual } = require("node:util");
const { invocation, runCli, startCore } = require("@integral/desktop-host/core-runtime");
const releases = require("./releases");
const { compareCore, compareApp } = require("../release-contract");
const execute = promisify(execFile);
const ID = /^\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?-[a-f0-9]{16}$/;
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function regular(file) { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Expected a private regular runtime file."); return stat; }
function directory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink()) throw new Error("Runtime directories must not be symbolic links.");
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
}
function write(file, value) {
  if (fs.existsSync(file)) regular(file);
  const temporary = path.join(path.dirname(file), ".state-" + crypto.randomUUID());
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}
function copyHome(source, target) {
  if (fs.existsSync(target)) throw new Error("Recovery destination already exists.");
  fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false, dereference: false, verbatimSymlinks: true, filter: file => {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      // The pgserver venv contains interpreter links and a Unix lib64 alias.
      // Preserve only their literal targets; never follow a link into a backup.
      const relative = path.relative(source, file).split(path.sep).join("/"), link = fs.readlinkSync(file);
      if ((relative === "database-runtime/lib64" && link === "lib") ||
          (/^database-runtime\/bin\/python(?:3|3\.12)$/.test(relative) && link === "python") ||
          (relative === "database-runtime/bin/python" && path.isAbsolute(link) && path.basename(link) === "python3.12")) return true;
    }
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("Workspace backup refuses links or special files.");
    return true;
  } });
  if (process.platform !== "win32") fs.chmodSync(target, 0o700);
}
function identity(home) {
  const installationFile = path.join(home, "installation.json"); regular(installationFile);
  const accountDirectory = path.join(home, "one-account");
  if (fs.existsSync(accountDirectory) && fs.lstatSync(accountDirectory).isSymbolicLink()) throw new Error("Account state must not be a symbolic link.");
  const installation = JSON.parse(fs.readFileSync(installationFile, "utf8"));
  const keys = Object.fromEntries(Object.entries(installation).filter(([key, value]) => /key|token|secret|password/i.test(key) && typeof value === "string")
    .map(([key, value]) => [key, crypto.createHash("sha256").update(value).digest("hex")]));
  const accounts = {};
  for (const name of ["activation.json", "setup-key.json"]) {
    const file = path.join(home, "one-account", name);
    if (fs.existsSync(file)) { regular(file); accounts[name] = hash(file); }
  }
  return { keys, accounts };
}

function createRuntimeManager({ app, resources, channel, bundledCore, request = fetch, getRuntime, prepareForInstall,
  cliRunner = runCli, start = startCore, python = execute, discover = releases.discover, download = releases.download,
  environment = process.env, argv = process.argv, migrateStorage }) {
  let root, home, userData, state = { schemaVersion: 1 }, operation = null, lastRecovery = null;
  const options = () => ({ oneVersion: app.getVersion(), channel, platform: process.platform, arch: process.arch });
  const base = () => invocation({ resources, command: "", prefix: "" });
  function readState() {
    const file = path.join(root, "state.json");
    if (!fs.existsSync(file)) return { schemaVersion: 1 };
    if (regular(file).size > 65536) throw new Error("Runtime state needs recovery.");
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value.schemaVersion !== 1) throw new Error("Runtime state needs recovery.");
    for (const id of [value.active, value.staged, value.pending?.id, value.pending?.oldId, value.previous?.id])
      if (id !== undefined && id !== null && !ID.test(id)) throw new Error("Invalid stored runtime identity.");
    return value;
  }
  const persist = () => write(path.join(root, "state.json"), state);
  function stored(id) {
    if (!ID.test(id)) throw new Error("Invalid runtime selection.");
    const folder = path.join(root, "releases", id), descriptor = path.join(folder, "runtime-manifest.json");
    if (fs.lstatSync(folder).isSymbolicLink() || regular(descriptor).size > 65536) throw new Error("Runtime selection needs recovery.");
    const manifest = JSON.parse(fs.readFileSync(descriptor, "utf8"));
    if (id !== `${manifest.core.version}-${manifest.payload.sha256.slice(0, 16)}`) throw new Error("Stored runtime identity changed.");
    return { folder, manifest };
  }
  function release(id) {
    const { folder, manifest: raw } = stored(id), manifest = releases.validate(raw, options());
    const wheel = path.join(folder, manifest.wheel.file); regular(wheel);
    if (hash(wheel) !== manifest.wheel.sha256) throw new Error("The selected runtime changed. Open recovery before continuing.");
    return { id, folder, manifest, wheel };
  }
  function command(id) {
    const original = base();
    if (!id) return original;
    const selected = release(id), args = [...original.args], index = args.indexOf("--from");
    if (index < 0) throw new Error("This host cannot select an independent runtime.");
    args[index + 1] = selected.wheel;
    return { file: original.file, args };
  }
  function select(id) {
    const cli = command(id);
    environment.INTEGRAL_CORE_COMMAND = cli.file;
    environment.INTEGRAL_CORE_ARGS = JSON.stringify(cli.args);
  }
  function validateSnapshot(pending) {
    if (pending.home !== home || path.dirname(pending.snapshot || "") !== path.dirname(home) ||
        !/^\.one-runtime-snapshot-[a-f0-9-]{36}$/.test(path.basename(pending.snapshot || "")) ||
        fs.lstatSync(pending.snapshot).isSymbolicLink() || !fs.lstatSync(pending.snapshot).isDirectory())
      throw new Error("The runtime recovery snapshot is unavailable.");
    if (JSON.stringify(identity(pending.snapshot)) !== JSON.stringify(pending.identity)) throw new Error("The runtime recovery keys changed.");
  }
  async function stopped(cli) {
    const status = await cliRunner(cli, ["status", "--home", home, "--json"]);
    if (status.state !== "stopped") throw new Error("A workspace process is running. Close it before runtime recovery.");
    if (fs.existsSync(path.join(home, "postgres/postmaster.pid")) || fs.existsSync(path.join(home, "database.json")))
      throw new Error("A database process or stale readiness needs review before recovery.");
  }
  async function restore(pending) {
    if (pending.phase !== "restoring") {
      validateSnapshot(pending);
      await stopped(command(pending.oldId));
      pending.retainedHome = path.join(path.dirname(home), ".one-runtime-recovery-" + crypto.randomUUID());
      pending.phase = "restoring"; persist();
    }
    const retained = pending.retainedHome;
    if (pending.home !== home || path.dirname(retained || "") !== path.dirname(home) ||
        !/^\.one-runtime-recovery-[a-f0-9-]{36}$/.test(path.basename(retained || "")))
      throw new Error("Invalid runtime recovery destination.");
    if (fs.existsSync(pending.snapshot)) {
      validateSnapshot(pending);
      if (fs.existsSync(home)) {
        if (fs.lstatSync(home).isSymbolicLink()) throw new Error("Runtime recovery refuses a linked workspace.");
        if (fs.existsSync(retained)) throw new Error("Runtime recovery needs an exclusive workspace directory.");
        await stopped(command(pending.oldId));
        fs.renameSync(home, retained);
      }
      if (!fs.existsSync(retained) || fs.lstatSync(retained).isSymbolicLink()) throw new Error("The retained recovery home is unavailable.");
      fs.renameSync(pending.snapshot, home);
    }
    if (!fs.existsSync(retained) || fs.lstatSync(retained).isSymbolicLink() ||
        !fs.existsSync(home) || fs.lstatSync(home).isSymbolicLink() ||
        JSON.stringify(identity(home)) !== JSON.stringify(pending.identity)) throw new Error("The restored runtime home needs recovery.");
    await stopped(command(pending.oldId));
    state.active = pending.oldId || null;
    state.failed = pending.id;
    state.pending = null;
    state.staged = null;
    state.lastRecovery = { at: new Date().toISOString(), retainedHome: retained, core: state.active ? release(state.active).manifest.core.version : bundledCore.version };
    persist(); lastRecovery = state.lastRecovery;
  }
  async function activate() {
    const pending = state.pending;
    if (pending.phase === "restoring") { await restore(pending); return; }
    validateSnapshot(pending);
    if (pending.phase !== "ready") { await restore(pending); return; }
    await stopped(command(pending.oldId));
    const selected = release(pending.id);
    let trial, expectedIdentity = pending.identity, runtimeUser;
    pending.phase = "trial"; persist();
    try {
      if (pending.storageMigration) {
        const approval = pending.storageMigration;
        if (!/^[a-f0-9]{64}$/.test(approval.approvedHash)) throw new Error("Invalid migration approval.");
        const planPath = path.join(root, `migration-${approval.approvedHash}.json`);
        if (regular(planPath).size > 16 * 1024 ** 2) throw new Error("Migration plan exceeds size limit.");
        if (hash(planPath) !== approval.approvedHash) throw new Error("Reviewed migration changed.");
        const envelope = JSON.parse(fs.readFileSync(planPath, "utf8"));
        if (envelope.version !== 1 || envelope.home !== fs.realpathSync(home) ||
            envelope.installation_id !== pending.installationId || envelope.wheel_sha256 !== selected.manifest.wheel.sha256)
          throw new Error("Migration does not match the selected home and runtime.");
        let receipt;
        if (migrateStorage) receipt = await migrateStorage({ home, planPath, approvedHash: approval.approvedHash, selected });
        else {
          const cli = command(pending.id);
          if (cli.args.at(-1) !== "integral") throw new Error("Unsupported maintenance command.");
          const script = fs.readFileSync(path.join(__dirname, "storage-migration.py"), "utf8");
          const env = { ...environment }; delete env.PYTHONPATH;
          const output = await python(cli.file, [...cli.args.slice(0, -1), "python", "-c", script,
            "apply", "--home", home, "--wheel", selected.wheel, "--plan", planPath, "--approved-hash", approval.approvedHash],
            { timeout: 30 * 60_000, maxBuffer: 1024 * 1024, windowsHide: true, env });
          receipt = JSON.parse(output.stdout);
        }
        const after = identity(home), before = pending.identity;
        const installation = JSON.parse(fs.readFileSync(path.join(home, "installation.json"), "utf8"));
        if (before.keys.runtime_database_password !== undefined ||
            receipt?.plan_hash !== envelope.plan.hash || receipt.runtime_user !== envelope.plan.runtime_role ||
            installation.runtime_database_user !== receipt.runtime_user || installation.installation_id !== pending.installationId ||
            !/^[a-f0-9]{64}$/.test(installation.runtime_database_password || "") ||
            !/^[a-f0-9]{64}$/.test(receipt.password_sha256 || "") ||
            !isDeepStrictEqual(after.accounts, before.accounts) ||
            !isDeepStrictEqual(after.keys, { ...before.keys, runtime_database_password: receipt.password_sha256 }))
          throw new Error("Migration did not preserve the reviewed installation identity.");
        expectedIdentity = after; runtimeUser = receipt.runtime_user;
        await stopped(command(pending.oldId));
      }
      trial = await start({ home, resources, command: command(pending.id) });
      if (!trial.owned || trial.version !== selected.manifest.core.version || trial.installation_id !== pending.installationId ||
          JSON.parse(fs.readFileSync(path.join(home, "installation.json"), "utf8")).installation_id !== pending.installationId)
        throw new Error("Trial runtime did not preserve the owned installation.");
      if (!isDeepStrictEqual(identity(home), expectedIdentity) || (runtimeUser &&
          JSON.parse(fs.readFileSync(path.join(home, "installation.json"), "utf8")).runtime_database_user !== runtimeUser))
        throw new Error("Trial runtime changed the account or installation keys.");
      const result = await cliRunner(trial.cli, ["stop", "--home", home, "--json", "--if-pid", String(trial.pid), "--if-created", String(trial.process_created)]);
      if (result.state !== "stopped") throw new Error("Trial runtime did not stop.");
      state.active = pending.id;
      state.previous = { id: pending.oldId || null, snapshot: pending.snapshot, home, identity: pending.identity, installationId: pending.installationId, backupDirectory: pending.backupDirectory };
      state.staged = null; state.pending = null; state.failed = null;
      state.lastUpdate = { at: new Date().toISOString(), core: selected.manifest.core.version };
      persist();
    } catch (error) {
      // A failed startup can leave a live process. Never replace a live/foreign home.
      if (trial?.owned) {
        await cliRunner(trial.cli, ["stop", "--home", home, "--json", "--if-pid", String(trial.pid), "--if-created", String(trial.process_created)]);
      }
      await restore(pending);
    }
  }
  async function beforeBoot({ userData: location }) {
    if (!app.isPackaged && environment.INTEGRAL_CORE_COMMAND) return;
    userData = location;
    root = path.join(userData, "runtime-updates");
    home = argv.find(value => value.startsWith("--home="))?.slice(7) || environment.INTEGRAL_HOME || path.join(userData, "core");
    if (!path.isAbsolute(home)) throw new Error("Runtime home must be an absolute path.");
    directory(userData); directory(root); directory(path.join(root, "releases"));
    state = readState();
    if (state.pending) await activate();
    const useBundle = !state.active || compareCore(stored(state.active).manifest.core.version, bundledCore.version) <= 0;
    if (useBundle) await require("./installer-storage").beforeBundledBoot({
      root, home, resources, cli: command(null), version: bundledCore.version, argv,
      cliRunner, start, copyHome, identity,
    });
    // Keep the previous external selection until replacement qualification has
    // succeeded, so reinstalling the old host also restores its runtime choice.
    if (useBundle && state.active) { state.active = null; persist(); }
    select(state.active);
  }
  function currentCore() { return state.active ? release(state.active).manifest.core.version : bundledCore.version; }
  function staged() {
    if (!state.staged) return null;
    if (compareCore(stored(state.staged).manifest.core.version, currentCore()) <= 0) return null;
    const selected = release(state.staged);
    return compareCore(selected.manifest.core.version, currentCore()) > 0 ? selected : null;
  }
  async function check() {
    if (!root) throw new Error("Runtime updater has not started.");
    return discover({ currentCore: currentCore(), ...options(), request });
  }
  async function stage(candidate, onProgress = () => {}) {
    if (operation) return operation;
    operation = (async () => {
      const manifest = releases.validate(candidate.manifest, options());
      if (compareCore(manifest.core.version, currentCore()) <= 0) throw new Error("Runtime downgrade refused.");
      const policy = require("../release-contract").channelPolicy(channel);
      const detail = await publicJson(`${policy.index}/pypi/integral-core/${manifest.core.version}/json`, { request, limit: 1024 ** 2 });
      const upstream = releases.publishedWheel(detail.urls, manifest.core, policy.registry);
      const id = `${manifest.core.version}-${manifest.payload.sha256.slice(0, 16)}`;
      const target = path.join(root, "releases", id);
      if (!fs.existsSync(target)) {
        const work = fs.mkdtempSync(path.join(root, ".download-"));
        try {
          const manifestFile = path.join(work, "manifest.json"), payload = path.join(work, "payload.zip"), baseWheel = path.join(work, "base.whl"), extracted = path.join(work, "verified");
          write(manifestFile, manifest);
          await download(candidate.url, payload, { ...manifest.payload, request, onProgress });
          await download(upstream.url, baseWheel, { bytes: upstream.size, sha256: manifest.core.wheelSha256, packageFile: true, request });
          const script = fs.readFileSync(path.join(__dirname, "payload.py"), "utf8");
          await python(base().file, ["run", "--no-project", "--managed-python", "--python", "3.12", "python", "-c", script, payload, baseWheel, manifestFile, extracted], { timeout: 10 * 60_000, maxBuffer: 1024 * 1024, windowsHide: true });
          fs.renameSync(extracted, target);
        } finally { fs.rmSync(work, { recursive: true, force: true }); }
      }
      release(id);
      state.staged = id; state.failed = null; persist();
      return staged();
    })().finally(() => { operation = null; });
    return operation;
  }
  async function install({ storageMigration } = {}) {
    if (!storageMigration) {
      const planPath = argv.find(value => value.startsWith("--storage-plan="))?.slice(15);
      const approvedHash = argv.find(value => value.startsWith("--storage-approved-hash="))?.slice(24);
      if (planPath || approvedHash) storageMigration = { planPath, approvedHash };
    }
    if (operation) throw new Error("Wait for the runtime download to finish.");
    operation = installOnce(storageMigration).finally(() => { operation = null; });
    return operation;
  }
  async function installOnce(storageMigration) {
    const selected = staged(), runtime = getRuntime();
    // Core reports a canonical path (for example, /private/tmp on macOS).
    // Resolve parent aliases without accepting a symlink as the home itself.
    const canonicalHome = value => path.join(fs.realpathSync(path.dirname(value)), path.basename(value));
    if (!selected || !runtime?.owned || !runtime.home || canonicalHome(runtime.home) !== canonicalHome(home)) {
      throw new Error("This app must own the workspace before updating.");
    }
    if (!storageMigration && migrationRequirement())
      throw new Error("This workspace needs an assisted update with a reviewed storage plan before installation.");
    let approval;
    if (storageMigration) {
      const { planPath, approvedHash } = storageMigration;
      if (regular(planPath).size > 16 * 1024 ** 2) throw new Error("Migration plan exceeds size limit.");
      if (!/^[a-f0-9]{64}$/.test(approvedHash) || hash(planPath) !== approvedHash)
        throw new Error("Approval must name the exact reviewed migration file.");
      const envelope = JSON.parse(fs.readFileSync(planPath, "utf8"));
      if (envelope.version !== 1 || envelope.home !== fs.realpathSync(home) ||
          envelope.installation_id !== runtime.installation_id || envelope.wheel_sha256 !== selected.manifest.wheel.sha256)
        throw new Error("Migration does not match the selected home and runtime.");
      const saved = path.join(root, `migration-${approvedHash}.json`);
      if (fs.existsSync(saved)) { regular(saved); if (hash(saved) !== approvedHash) throw new Error("Saved migration changed."); }
      else fs.writeFileSync(saved, fs.readFileSync(planPath), { flag: "wx", mode: 0o600 });
      approval = { approvedHash };
    }
    const before = identity(home), backupDirectory = await prepareForInstall();
    if (!runtime.stopped) throw new Error("Workspace stop did not complete.");
    await stopped(command(state.active));
    const snapshot = path.join(path.dirname(home), ".one-runtime-snapshot-" + crypto.randomUUID());
    copyHome(home, snapshot);
    if (JSON.stringify(identity(snapshot)) !== JSON.stringify(before)) throw new Error("Workspace backup integrity failed.");
    state.pending = { id: selected.id, oldId: state.active || null, home, snapshot, identity: before,
      installationId: runtime.installation_id, backupDirectory, phase: "ready", ...(approval ? { storageMigration: approval } : {}) };
    persist();
    const args = argv.slice(1).filter(value => value.startsWith("--home=") || value.startsWith("--user-data-dir="));
    app.relaunch({ args }); app.quit();
  }
  function migrationRequirement(kind = "runtime") {
    return require("./migration-readiness").needsAssistedMigration(home, argv, kind)
      ? { code: "reviewed-storage-plan-required" } : null;
  }
  function canInstallHost(manifest) {
    if (!state.active) return true;
    const selected = release(state.active).manifest;
    return compareCore(manifest.core.version, selected.core.version) >= 0 ||
      (compareApp(manifest.version, selected.minimumOneVersion) >= 0 && compareApp(manifest.version, selected.maximumOneVersionExclusive) < 0);
  }
  return { beforeBoot, check, stage, install, staged, currentCore, canInstallHost, migrationRequirement, recovery: () => lastRecovery,
    failed: () => state.failed, state: () => structuredClone(state) };
}
// Keep metadata fetching separate from staged code and local account authority.
const { publicJson } = require("../releases");
module.exports = { createRuntimeManager, copyHome, identity };
