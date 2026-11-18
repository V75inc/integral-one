"use strict";
// Runs under the desktop host's single-instance lock, before any serving boot.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Installer migration requires regular private files.");
}
function read(file) { regular(file); return JSON.parse(fs.readFileSync(file, "utf8")); }
function write(file, value) {
  if (fs.existsSync(file)) regular(file);
  const temporary = file + "." + crypto.randomUUID();
  try { fs.writeFileSync(temporary, JSON.stringify(value), {flag: "wx", mode: 0o600}); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, {force: true}); }
}
async function beforeBundledBoot({ root, home, resources, cli, version, argv, cliRunner, start, copyHome, identity }) {
  const journal = path.join(root, "installer-storage.json");
  const flag = name => argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const planPath = flag("installer-storage-plan"), approvedHash = flag("installer-storage-approved-hash");
  let transaction = fs.existsSync(journal) ? read(journal) : null;
  const wheel = cli.args[cli.args.indexOf("--from") + 1];
  const capability = path.join(resources, "core/storage-upgrade.json");
  let managed = false;
  if (fs.existsSync(capability)) {
    const support = read(capability);
    if (support.schemaVersion !== 1 || typeof support.managedStorage !== "boolean" || !wheel || hash(wheel) !== support.wheelSha256)
      throw new Error("Installer storage capability does not match its bundled wheel.");
    managed = support.managedStorage;
  }
  if (!transaction && !planPath && !approvedHash) {
    if (managed && fs.existsSync(path.join(home, "installation.json"))) {
      const config = read(path.join(home, "installation.json"));
      if (fs.existsSync(path.join(home, "postgres")) && (!config.runtime_database_user || !config.runtime_database_password))
        throw new Error("This legacy workspace needs a reviewed storage plan before the replacement installer can start.");
    }
    return;
  }
  if (!wheel || cli.args.at(-1) !== "integral") throw new Error("Installer migration requires a verified bundled wheel.");
  regular(wheel);
  const wheelHash = hash(wheel);
  async function stopped() {
    const status = await cliRunner(cli, ["status", "--home", home, "--json"]);
    if (status.state !== "stopped" || fs.existsSync(path.join(home, "postgres/postmaster.pid")) || fs.existsSync(path.join(home, "database.json")))
      throw new Error("Stop the workspace and its database before installer migration or recovery.");
  }
  function snapshotValid() {
    if (transaction.home !== home || path.dirname(transaction.snapshot || "") !== path.dirname(home) ||
        !/^\.one-installer-snapshot-[a-f0-9-]{36}$/.test(path.basename(transaction.snapshot || ""))) throw new Error("Invalid installer recovery snapshot.");
    if (fs.existsSync(transaction.snapshot) && (fs.lstatSync(transaction.snapshot).isSymbolicLink() ||
        !isDeepStrictEqual(identity(transaction.snapshot), transaction.identity))) throw new Error("Installer recovery identity changed.");
  }
  async function restore() {
    snapshotValid();
    if (transaction.phase !== "restoring") {
      await stopped();
      transaction.retainedHome = path.join(path.dirname(home), ".one-installer-recovery-" + crypto.randomUUID());
      transaction.phase = "restoring"; write(journal, transaction);
    }
    const retained = transaction.retainedHome;
    if (path.dirname(retained || "") !== path.dirname(home) || !/^\.one-installer-recovery-[a-f0-9-]{36}$/.test(path.basename(retained || "")))
      throw new Error("Invalid installer recovery destination.");
    if (fs.existsSync(transaction.snapshot)) {
      if (fs.existsSync(home)) {
        if (fs.lstatSync(home).isSymbolicLink() || fs.existsSync(retained)) throw new Error("Installer recovery requires an exclusive home.");
        await stopped(); fs.renameSync(home, retained);
      }
      if (!fs.existsSync(retained) || fs.lstatSync(retained).isSymbolicLink()) throw new Error("Failed installer home is unavailable.");
      fs.renameSync(transaction.snapshot, home);
    }
    if (!fs.existsSync(retained) || fs.lstatSync(retained).isSymbolicLink() || fs.lstatSync(home).isSymbolicLink() ||
        !isDeepStrictEqual(identity(home), transaction.identity)) throw new Error("Restored installer identity failed verification.");
    await stopped(); transaction.phase = "rolled-back"; write(journal, transaction);
  }
  if (transaction) {
    if (transaction.schemaVersion !== 1 || transaction.home !== home || !["ready", "trial", "restoring", "complete", "rolled-back"].includes(transaction.phase))
      throw new Error("Installer migration journal needs recovery.");
    if (["trial", "restoring"].includes(transaction.phase)) await restore();
    if (transaction.phase === "rolled-back") {
      if (flag("installer-storage-retry-hash") !== transaction.approvedHash || !planPath || !approvedHash)
        throw new Error("Installer migration rolled back. Use the retained old installer, or explicitly review and retry the storage plan.");
      // Preserve the prior recovery receipt before starting a separately approved attempt.
      write(path.join(root, "installer-recovery-" + crypto.randomUUID() + ".json"), transaction);
      transaction = null;
    } else if (transaction.phase === "complete") {
      return; // Normal Core startup independently enforces managed catalog readiness.
    }
  }
  if (!transaction) {
    if (!planPath || !/^[a-f0-9]{64}$/.test(approvedHash || "")) throw new Error("Installer migration needs the exact reviewed plan hash.");
    regular(planPath);
    if (fs.statSync(planPath).size > 16 * 1024 ** 2 || hash(planPath) !== approvedHash) throw new Error("Installer migration approval changed.");
    const plan = read(planPath), config = read(path.join(home, "installation.json"));
    if (plan.version !== 1 || plan.home !== fs.realpathSync(home) || plan.installation_id !== config.installation_id || plan.wheel_sha256 !== wheelHash)
      throw new Error("Installer migration plan does not match this home and wheel.");
    if (config.runtime_database_user !== undefined || config.runtime_database_password !== undefined) throw new Error("Installer migration refuses existing or partial runtime credentials.");
    const savedPlan = path.join(root, `installer-plan-${approvedHash}.json`);
    if (fs.existsSync(savedPlan)) { regular(savedPlan); if (hash(savedPlan) !== approvedHash) throw new Error("Saved installer plan changed."); }
    else fs.writeFileSync(savedPlan, fs.readFileSync(planPath), { flag: "wx", mode: 0o600 });
    await stopped();
    const before = identity(home), snapshot = path.join(path.dirname(home), ".one-installer-snapshot-" + crypto.randomUUID());
    copyHome(home, snapshot);
    if (!isDeepStrictEqual(identity(snapshot), before)) throw new Error("Installer snapshot identity failed verification.");
    transaction = { schemaVersion: 1, phase: "ready", home, snapshot, identity: before, approvedHash, wheelHash, version, installationId: config.installation_id };
    write(journal, transaction);
  }
  snapshotValid();
  if (!fs.existsSync(transaction.snapshot)) throw new Error("Installer snapshot is missing.");
  if (transaction.wheelHash !== wheelHash || transaction.version !== version) throw new Error("Resume installer migration with the exact reviewed replacement installer.");
  const savedPlan = path.join(root, `installer-plan-${transaction.approvedHash}.json`);
  regular(savedPlan);
  if (hash(savedPlan) !== transaction.approvedHash) throw new Error("Saved installer approval changed.");
  const plan = read(savedPlan);
  await stopped(); transaction.phase = "trial"; write(journal, transaction);
  let trial, failureStage = "storage-apply";
  try {
    const receipt = await cliRunner(cli, ["storage-upgrade", "apply", "--home", home, "--wheel", wheel, "--plan", savedPlan, "--approved-hash", transaction.approvedHash], {timeout: 30 * 60_000});
    failureStage = "migration-identity";
    const config = read(path.join(home, "installation.json")), after = identity(home);
    if (receipt.plan_hash !== plan.plan.hash || receipt.runtime_user !== plan.plan.runtime_role ||
        config.installation_id !== transaction.installationId || config.runtime_database_user !== receipt.runtime_user ||
        !/^[a-f0-9]{64}$/.test(config.runtime_database_password || "") || !/^[a-f0-9]{64}$/.test(receipt.password_sha256 || "") ||
        !isDeepStrictEqual(after, {keys: {...transaction.identity.keys, runtime_database_password: receipt.password_sha256}, accounts: transaction.identity.accounts}))
      throw new Error("Installer migration changed the approved identity.");
    failureStage = "post-migration-stop";
    await stopped();
    failureStage = "trial-start";
    trial = await start({ home, resources, command: cli });
    failureStage = "trial-identity";
    const afterTrial = read(path.join(home, "installation.json"));
    if (!trial.owned || trial.version !== version || trial.installation_id !== transaction.installationId ||
        afterTrial.installation_id !== transaction.installationId || afterTrial.runtime_database_user !== receipt.runtime_user || !isDeepStrictEqual(identity(home), after))
      throw new Error("Replacement installer trial changed the owned identity.");
    failureStage = "trial-stop";
    const result = await cliRunner(trial.cli, ["stop", "--home", home, "--json", "--if-pid", String(trial.pid), "--if-created", String(trial.process_created)]);
    if (result.state !== "stopped") throw new Error("Replacement installer trial did not stop.");
    failureStage = "post-trial-stop";
    await stopped(); transaction.phase = "complete"; write(journal, transaction);
  } catch (error) {
    // Recovery can itself pause on a live process. Preserve the original stage
    // first, but never persist raw CLI errors, paths, tokens or credentials.
    transaction.failure = {
      stage: failureStage,
      category: failureStage === "trial-start" && /Startup timed out|Preparing your workspace took too long/i.test(error?.message || "")
        ? "startup-timeout" : "operation-failed",
      at: new Date().toISOString(),
    };
    write(journal, transaction);
    if (trial?.owned) await cliRunner(trial.cli, ["stop", "--home", home, "--json", "--if-pid", String(trial.pid), "--if-created", String(trial.process_created)]);
    await restore();
    throw new Error("Replacement installer trial failed; the complete old home was restored and the failed home retained. Reinstall the retained old application before normal boot.");
  }
}
module.exports = { beforeBundledBoot };
