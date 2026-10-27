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
