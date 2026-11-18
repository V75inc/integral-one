"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { createRuntimeManager } = require("../desktop/runtime-updates/manager");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "one-runtime-manager-")), userData = path.join(dir, "profile"), home = path.join(userData, "core"), resources = path.join(dir, "resources");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const folder of [path.join(home, "one-account"), path.join(home, "store"), path.join(resources, "core")]) fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(home, "installation.json"), JSON.stringify({ installation_id: "installation", encryption_key: "unchanged-key" }));
  fs.writeFileSync(path.join(home, "one-account/activation.json"), "unchanged activation");
  fs.writeFileSync(path.join(home, "one-account/setup-key.json"), "unchanged local integrity key");
  fs.writeFileSync(path.join(home, "store/record"), "original record");
  const wheelName = "integral_core-0.1.1rc35-py3-none-any.whl", uvName = process.platform === "win32" ? "uv.exe" : "uv";
  fs.writeFileSync(path.join(resources, "core", wheelName), "bundled wheel"); fs.writeFileSync(path.join(resources, "core", uvName), "reviewed uv");
  fs.writeFileSync(path.join(resources, "core/runtime.json"), JSON.stringify({ contract_version: 1, runtime_contract_version: 1, runtime_preset: "local", deployment_profile: "desktop_single_user", platform: process.platform, arch: process.arch, coreWheel: wheelName, sha256: { [wheelName]: digest("bundled wheel"), uv: digest("reviewed uv") } }));
  const manifest = { schemaVersion: 1, product: "integral-one-runtime", channel: "development", hostContractVersion: 1, minimumOneVersion: "0.1.9", maximumOneVersionExclusive: "0.2.0", platforms: [`${process.platform}-${process.arch}`],
    core: { version: "0.1.1rc36", registry: "testpypi", wheelSha256: digest("upstream wheel") }, wheel: { file: "integral_core-0.1.1rc36-py3-none-any.whl", sha256: digest("composed wheel") },
    payload: { file: "integral-one-runtime-0.1.1rc36.zip", bytes: 7, sha256: digest("payload") }, source: { one: "a".repeat(40), core: "b".repeat(40) } };
  const upstream = { filename: manifest.wheel.file, packagetype: "bdist_wheel", yanked: false, size: 14, digests: { sha256: manifest.core.wheelSha256 }, url: "https://test-files.pythonhosted.org/core.whl" };
  const candidate = { manifest, upstream, url: "https://github.com/V75inc/integral-one/releases/download/core-v0.1.1rc36/" + manifest.payload.file };
  let running = false, failure = false, starts = 0, downloads = 0, backups = 0;
  const relaunches = [], environment = {}, runtime = { home, owned: true, stopped: false, installation_id: "installation" };
  const app = { isPackaged: true, getVersion: () => "0.1.9", relaunch: options => relaunches.push(options), quit() {} };
  const options = { app, resources, channel: "development", bundledCore: { version: "0.1.1rc35" }, environment,
    argv: ["app", "--home=" + home, "--user-data-dir=" + userData, "--remote-debugging-port=9000"], getRuntime: () => runtime,
    prepareForInstall: async () => { backups++; runtime.owned = false; runtime.stopped = true; const backup = path.join(userData, "backups", String(backups)); fs.mkdirSync(backup, { recursive: true }); return backup; },
    request: async () => ({ ok: true, redirected: false, body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(JSON.stringify({ urls: [upstream] }))); controller.close(); } }) }),
    download: async (_url, file) => { downloads++; fs.writeFileSync(file, "fixture"); },
    python: async (_file, args) => { const target = args.at(-1); fs.mkdirSync(target); fs.writeFileSync(path.join(target, manifest.wheel.file), "composed wheel"); fs.writeFileSync(path.join(target, "runtime-manifest.json"), JSON.stringify(manifest)); },
    start: async ({ command }) => { starts++; if (failure) { fs.writeFileSync(path.join(home, "store/record"), "partial migration"); throw Error("trial failed"); } running = true; return { owned: true, version: "0.1.1rc36", installation_id: "installation", pid: 100, process_created: 10, cli: command }; },
    cliRunner: async (_command, args) => { if (args[0] === "status") return { state: running ? "ready" : "stopped" }; assert.equal(args[0], "stop"); assert.deepEqual(args.slice(-4), ["--if-pid", "100", "--if-created", "10"]); running = false; return { state: "stopped" }; },
  };
  const manager = createRuntimeManager(options);
  return { dir, home, userData, environment, runtime, options, manager, manifest, candidate, app,
    boot: () => manager.beforeBoot({ userData }), restart: () => { const next = createRuntimeManager(options); return next.beforeBoot({ userData }).then(() => next); },
    fail: () => { failure = true; }, foreign: () => { running = true; }, relaunches,
    counts: () => ({ starts, downloads, backups }), stateFile: path.join(userData, "runtime-updates/state.json") };
}
test("a runtime download is persisted without installing; restart requires a separate request", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate);
  assert.equal(f.manager.currentCore(), "0.1.1rc35"); assert.equal(f.manager.staged().manifest.core.version, "0.1.1rc36");
  const resumed = await f.restart(); assert.equal(resumed.staged().manifest.core.version, "0.1.1rc36"); assert.equal(f.counts().starts, 0); assert.equal(f.relaunches.length, 0);
});
test("activation uses the reviewed uv, probes the new engine and retains account/keys/records", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate); await f.manager.install();
  assert.equal(f.counts().backups, 1); assert.deepEqual(f.relaunches[0].args, ["--home=" + f.home, "--user-data-dir=" + f.userData]);
  const active = await f.restart(); assert.equal(active.currentCore(), "0.1.1rc36"); assert.equal(active.staged(), null); assert.equal(f.counts().starts, 1);
  assert.equal(fs.readFileSync(path.join(f.home, "store/record"), "utf8"), "original record");
  assert.equal(fs.readFileSync(path.join(f.home, "one-account/setup-key.json"), "utf8"), "unchanged local integrity key");
  assert.ok(JSON.parse(f.environment.INTEGRAL_CORE_ARGS).some(value => value.includes(path.join("runtime-updates", "releases", "0.1.1rc36-"))));
  assert.equal(active.state().pending, null); assert.ok(fs.existsSync(active.state().previous.snapshot));
});
test("an alternate parent path can update the same owned home, but a different home is refused", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate);
  const alias = path.join(f.dir, "alias");
  fs.symlinkSync(f.userData, alias, "junction");
  f.runtime.home = path.join(alias, "other");
  await assert.rejects(f.manager.install(), /must own/);
  assert.equal(f.counts().backups, 0);
  f.runtime.home = path.join(alias, "core");
  await f.manager.install();
  assert.equal(f.counts().backups, 1);
});
test("a failed trial restores the old runtime and complete cold home while retaining the failed copy", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate); await f.manager.install(); f.fail();
  const active = await f.restart(); assert.equal(active.currentCore(), "0.1.1rc35"); assert.ok(active.recovery());
  assert.equal(fs.readFileSync(path.join(f.home, "store/record"), "utf8"), "original record");
  assert.equal(fs.readFileSync(path.join(active.recovery().retainedHome, "store/record"), "utf8"), "partial migration");
  assert.equal(active.failed(), f.candidate.manifest.core.version + "-" + f.candidate.manifest.payload.sha256.slice(0, 16));
  assert.equal(active.staged(), null);
});
test("an interrupted trial restores before normal boot; it does not silently retry the failed engine", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate); await f.manager.install();
  const state = JSON.parse(fs.readFileSync(f.stateFile)); state.pending.phase = "trial"; fs.writeFileSync(f.stateFile, JSON.stringify(state));
  fs.writeFileSync(path.join(f.home, "store/record"), "interrupted migration");
  const active = await f.restart(); assert.equal(active.currentCore(), "0.1.1rc35"); assert.equal(f.counts().starts, 0); assert.ok(active.recovery());
});
test("a live foreign process prevents recovery without changing its home", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate); await f.manager.install(); f.foreign();
  await assert.rejects(f.restart(), /process is running/); assert.equal(fs.readFileSync(path.join(f.home, "store/record"), "utf8"), "original record"); assert.ok(JSON.parse(fs.readFileSync(f.stateFile)).pending);
});
test("runtime and backup tampering are rejected before touching the workspace", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate); await f.manager.install();
  const state = JSON.parse(fs.readFileSync(f.stateFile)); fs.appendFileSync(path.join(state.pending.snapshot, "one-account/setup-key.json"), "tampered");
  await assert.rejects(f.restart(), /recovery keys changed/); assert.equal(fs.readFileSync(path.join(f.home, "one-account/setup-key.json"), "utf8"), "unchanged local integrity key");
});
test("workspace links cannot enter a recovery snapshot, and concurrent restart requests coalesce", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate);
  const one = f.manager.install(); await assert.rejects(f.manager.install(), /Wait/); await one; assert.equal(f.counts().backups, 1);
  const g = fixture(t); await g.boot(); await g.manager.stage(g.candidate); fs.symlinkSync(path.join(g.home, "store"), path.join(g.home, "linked"), "junction");
  await assert.rejects(g.manager.install(), /links or special files/); assert.equal(g.relaunches.length, 0);
});
for (const phase of ["before-renames", "home-retained", "snapshot-restored"]) {
  test(`interrupted recovery resumes safely at ${phase}`, async t => {
    const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate); await f.manager.install();
    const state = JSON.parse(fs.readFileSync(f.stateFile)), pending = state.pending;
    pending.phase = "restoring"; pending.retainedHome = path.join(path.dirname(f.home), ".one-runtime-recovery-" + crypto.randomUUID());
    fs.writeFileSync(path.join(f.home, "store/record"), "partial migration");
    if (phase !== "before-renames") fs.renameSync(f.home, pending.retainedHome);
    if (phase === "snapshot-restored") fs.renameSync(pending.snapshot, f.home);
    fs.writeFileSync(f.stateFile, JSON.stringify(state));
    const restored = await f.restart(); assert.equal(restored.currentCore(), "0.1.1rc35"); assert.equal(restored.staged(), null);
    assert.equal(fs.readFileSync(path.join(f.home, "store/record"), "utf8"), "original record");
    assert.equal(fs.readFileSync(path.join(restored.recovery().retainedHome, "store/record"), "utf8"), "partial migration");
    assert.equal(restored.state().pending, null);
  });
}
test("cold snapshots preserve only Core's generated interpreter links without following them", async t => {
 const f=fixture(t), bin=path.join(f.home,'database-runtime/bin');fs.mkdirSync(bin,{recursive:true});
 if(process.platform==='win32')return;
 const external=path.join(f.dir,'python3.12');fs.writeFileSync(external,'external interpreter is not copied');
 fs.symlinkSync(external,path.join(bin,'python'));fs.symlinkSync('python',path.join(bin,'python3'));fs.symlinkSync('python',path.join(bin,'python3.12'));
 await f.boot();await f.manager.stage(f.candidate);await f.manager.install();
 const snapshot=f.manager.state().pending.snapshot;
 assert.ok(fs.lstatSync(path.join(snapshot,'database-runtime/bin/python')).isSymbolicLink());
 assert.equal(fs.readlinkSync(path.join(snapshot,'database-runtime/bin/python')),external);
 assert.equal(fs.readlinkSync(path.join(snapshot,'database-runtime/bin/python3')),'python');
});
test("a newer desktop can replace an older external runtime with its bundled fallback",async t=>{
 const f=fixture(t);await f.boot();await f.manager.stage(f.candidate);await f.manager.install();await f.restart();
 f.options.bundledCore={version:'0.1.1rc37'};f.app.getVersion=()=> '0.2.0';
 const next=await f.restart();assert.equal(next.state().active,null);assert.equal(next.currentCore(),'0.1.1rc37');
});

for (const change of ["add-runtime-password", "replace-key", "remove-key", "change-account"]) {
  test(`an unreviewed identity change (${change}) restores data and attachments`, async t => {
    const f = fixture(t);
    const attachment = path.join(f.home, "store", "attachment.bin");
    const original = Buffer.from([0, 255, 1, 128, 13, 10]);
    fs.writeFileSync(attachment, original);
    await f.boot(); await f.manager.stage(f.candidate); await f.manager.install();
    const start = f.options.start;
    f.options.start = async options => {
      const trial = await start(options);
      const file = path.join(f.home, "installation.json");
      const config = JSON.parse(fs.readFileSync(file));
      if (change === "add-runtime-password") config.runtime_database_password = "unreviewed-fixture-password";
      if (change === "replace-key") config.encryption_key = "replacement-fixture-key";
      if (change === "remove-key") delete config.encryption_key;
      if (change === "change-account") fs.writeFileSync(path.join(f.home, "one-account/activation.json"), "changed activation");
      fs.writeFileSync(file, JSON.stringify(config));
      fs.writeFileSync(attachment, "partial attachment migration");
      fs.writeFileSync(path.join(f.home, "store/record"), "partial record migration");
      return trial;
    };
    const restored = await f.restart();
    assert.equal(restored.currentCore(), "0.1.1rc35");
    assert.ok(restored.failed());
    assert.deepEqual(fs.readFileSync(attachment), original);
    assert.equal(fs.readFileSync(path.join(f.home, "store/record"), "utf8"), "original record");
    assert.equal(fs.readFileSync(path.join(f.home, "one-account/activation.json"), "utf8"), "unchanged activation");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.home, "installation.json"))), {
      installation_id: "installation", encryption_key: "unchanged-key"
    });
    assert.equal(fs.readFileSync(path.join(restored.recovery().retainedHome, "store/attachment.bin"), "utf8"), "partial attachment migration");
    const starts = f.counts().starts;
    const again = await f.restart();
    assert.equal(again.currentCore(), "0.1.1rc35");
    assert.equal(f.counts().starts, starts, "recovery must not retry the failed runtime");
  });
}

function reviewedMigration(f) {
  const plan = { version: 1, home: fs.realpathSync(f.home), installation_id: "installation",
    wheel_sha256: f.manifest.wheel.sha256,
    plan: { hash: "a".repeat(64), runtime_role: "integral_runtime_" + "b".repeat(16) } };
  const planPath = path.join(f.dir, "reviewed-plan.json");
  fs.writeFileSync(planPath, JSON.stringify(plan));
  const password = "c".repeat(64);
  f.options.migrateStorage = async () => {
    const file = path.join(f.home, "installation.json"), config = JSON.parse(fs.readFileSync(file));
    fs.writeFileSync(file, JSON.stringify({ ...config, runtime_database_user: plan.plan.runtime_role, runtime_database_password: password }));
    return { plan_hash: plan.plan.hash, runtime_user: plan.plan.runtime_role, password_sha256: digest(password) };
  };
  return { planPath, approvedHash: digest(fs.readFileSync(planPath)) };
}

test("only an explicitly approved migration may add the exact generated runtime credential", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate);
  const approval = reviewedMigration(f);
  await f.manager.install({ storageMigration: approval });
  const active = await f.restart();
  assert.equal(active.currentCore(), "0.1.1rc36");
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.home, "installation.json"))).encryption_key, "unchanged-key");
  assert.equal(fs.readFileSync(path.join(f.home, "store/record"), "utf8"), "original record");
  assert.equal(JSON.parse(fs.readFileSync(path.join(active.state().previous.snapshot, "installation.json"))).runtime_database_password, undefined);
});

for (const bad of ["old-key", "extra-key", "receipt", "role-during-trial", "apply-failure"]) {
  test(`reviewed migration still rejects ${bad} and restores the cold home`, async t => {
    const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate);
    const approval = reviewedMigration(f), migrate = f.options.migrateStorage;
    f.options.migrateStorage = async options => {
      const receipt = await migrate(options), file = path.join(f.home, "installation.json");
      const config = JSON.parse(fs.readFileSync(file));
      if (bad === "old-key") config.encryption_key = "changed";
      if (bad === "extra-key") config.unreviewed_secret = "extra";
      if (bad === "receipt") receipt.password_sha256 = "d".repeat(64);
      fs.writeFileSync(file, JSON.stringify(config));
      if (bad === "apply-failure") throw Error("interrupted apply");
      return receipt;
    };
    if (bad === "role-during-trial") {
      const start = f.options.start;
      f.options.start = async options => {
        const result = await start(options), file = path.join(f.home, "installation.json");
        const config = JSON.parse(fs.readFileSync(file)); config.runtime_database_user = "foreign_role";
        fs.writeFileSync(file, JSON.stringify(config)); return result;
      };
    }
    await f.manager.install({ storageMigration: approval });
    const restored = await f.restart();
    assert.equal(restored.currentCore(), "0.1.1rc35");
    assert.ok(restored.recovery());
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.home, "installation.json"))), { installation_id: "installation", encryption_key: "unchanged-key" });
  });
}

test("changed migration approval is rejected before stopping or backing up", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate);
  const approval = reviewedMigration(f); fs.appendFileSync(approval.planPath, " ");
  await assert.rejects(f.manager.install({ storageMigration: approval }), /exact reviewed/);
  assert.equal(f.counts().backups, 0);
});

test("a maintenance database marker prevents renaming the recovery home", async t => {
  const f = fixture(t); await f.boot(); await f.manager.stage(f.candidate); await f.manager.install();
  fs.mkdirSync(path.join(f.home, "postgres")); fs.writeFileSync(path.join(f.home, "postgres/postmaster.pid"), "fixture-process");
  await assert.rejects(f.restart(), /database process/);
  assert.equal(fs.readFileSync(path.join(f.home, "store/record"), "utf8"), "original record");
  assert.equal(JSON.parse(fs.readFileSync(f.stateFile)).pending.phase, "ready");
});

for (const failTrial of [false, true]) {
  test(`populated private PostgreSQL migration ${failTrial ? "rolls back" : "activates"} with attachment preservation`,
    { skip: !process.env.ONE_STORAGE_FIXTURE, timeout: 240_000 }, async t => {
      const executeReal = require("node:util").promisify(require("node:child_process").execFile);
      const python = process.env.ONE_STORAGE_PYTHON;
      assert.ok(python, "qualification requires the selected Core Python interpreter");
      const f = fixture(t);
      fs.cpSync(process.env.ONE_STORAGE_FIXTURE, f.home, { recursive: true, dereference: false, verbatimSymlinks: true });
      const attachment = path.join(f.home, "store/attachment.bin"), bytes = Buffer.from([0, 128, 255, 13, 10]);
      fs.writeFileSync(attachment, bytes);
      const originalConfig = JSON.parse(fs.readFileSync(path.join(f.home, "installation.json")));
      await f.boot(); await f.manager.stage(f.candidate);
      const script = path.resolve(__dirname, "../desktop/runtime-updates/storage-migration.py");
      const planPath = path.join(f.dir, "reviewed-real-plan.json"), selected = f.manager.staged();
      await executeReal(python, [script, "plan", "--home", f.home, "--wheel", selected.wheel, "--plan", planPath,
        "--max-indexes", "2000", "--max-index-bytes", "2000000000", "--max-build-bytes", "3000000000"],
        { timeout: 180_000, maxBuffer: 1024 ** 2 });
      const approvedHash = digest(fs.readFileSync(planPath));
      f.options.migrateStorage = async ({ home, planPath: saved, approvedHash: hash, selected }) => {
        const result = await executeReal(python, [script, "apply", "--home", home, "--wheel", selected.wheel,
          "--plan", saved, "--approved-hash", hash], { timeout: 180_000, maxBuffer: 1024 ** 2 });
        return JSON.parse(result.stdout);
      };
      if (failTrial) f.options.start = async () => {
        fs.writeFileSync(attachment, "partial failed trial"); throw Error("injected trial failure");
      };
      await f.manager.install({ storageMigration: { planPath, approvedHash } });
      const result = await f.restart();
      assert.equal(result.currentCore(), failTrial ? "0.1.1rc35" : "0.1.1rc36");
      assert.deepEqual(fs.readFileSync(attachment), bytes);
      const config = JSON.parse(fs.readFileSync(path.join(f.home, "installation.json")));
      for (const [key, value] of Object.entries(originalConfig)) assert.deepEqual(config[key], value);
      assert.equal(Boolean(config.runtime_database_password), !failTrial);
      if (failTrial) {
        assert.equal(fs.readFileSync(path.join(result.recovery().retainedHome, "store/attachment.bin"), "utf8"), "partial failed trial");
      }
      // Open the actual post-recovery database using the same private lifecycle.
      const readback = await executeReal(python, ["-c", `
import asyncio, importlib.util, json, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('one_migration',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with m.private_database(Path(sys.argv[2])) as dsn:
 async def read():
  import asyncpg
  conn=await asyncpg.connect(dsn)
  try:
   data=await conn.fetchval("SELECT data FROM object WHERE id='retained'")
   catalog=bool(await conn.fetchval("SELECT to_regclass('public.integral_index_catalog')"))
   return {'body':json.loads(data)['context']['body'],'catalog':catalog}
  finally: await conn.close()
 result=asyncio.run(read())
print(json.dumps(result))
`, script, f.home], { timeout: 180_000, maxBuffer: 1024 ** 2 });
      assert.deepEqual(JSON.parse(readback.stdout), { body: "legacy populated record", catalog: !failTrial });
    });
}

test("failed replacement qualification preserves the old external runtime selection",async t=>{
 const f=fixture(t);await f.boot();await f.manager.stage(f.candidate);await f.manager.install();const old=await f.restart();
 const oldId=old.state().active;f.options.bundledCore={version:'0.1.1rc37'};
 fs.mkdirSync(path.join(f.home,'postgres'));
 fs.writeFileSync(path.join(f.options.resources,'core/storage-upgrade.json'),JSON.stringify({schemaVersion:1,managedStorage:true,wheelSha256:digest('bundled wheel')}));
 await assert.rejects(f.restart(),/reviewed storage plan/);
 assert.equal(JSON.parse(fs.readFileSync(f.stateFile)).active,oldId);
});

test("legacy assisted-update refusal happens before stopping, backing up or relaunching", async t => {
 const f=fixture(t);fs.mkdirSync(path.join(f.home,"postgres"));await f.boot();await f.manager.stage(f.candidate);
 assert.equal(f.manager.migrationRequirement().code,"reviewed-storage-plan-required");
 await assert.rejects(()=>f.manager.install(),/assisted update/);
 assert.equal(f.counts().backups,0);assert.equal(f.relaunches.length,0);assert.equal(f.runtime.stopped,false);
});
