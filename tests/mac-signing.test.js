"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { signWithRuntimeManifest } = require("../scripts/sign-mac");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "one-sign-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "Integral One.app"), base = path.join(app, "Contents", "Resources", "core");
  fs.mkdirSync(base, { recursive: true });
  const uv = path.join(base, "uv"), wheel = path.join(base, "core.whl"), file = path.join(base, "runtime.json");
  fs.writeFileSync(uv, "approved launcher"); fs.writeFileSync(wheel, "immutable engine");
  const manifest = { contract_version: 1, runtime_contract_version: 1, runtime_preset: "local",
    platform: "darwin", arch: "arm64", coreWheel: "core.whl", sha256: { uv: hash(uv), "core.whl": hash(wheel) } };
  fs.writeFileSync(file, JSON.stringify(manifest));
  return { app, base, uv, wheel, file, manifest, options: { app, platform: "darwin", identity: "-" } };
}
test("signing records the signed launcher before sealing the outer application and preserves signer options", async t => {
  const f = fixture(t), events = [];
  f.options.optionsForFile = file => ({ marker: file });
  await signWithRuntimeManifest(f.options, {
    sign: async options => {
      assert.equal(options.optionsForFile(f.uv).marker, f.uv);
      fs.appendFileSync(f.uv, "signed Mach-O bytes"); events.push("child-signed");
      assert.equal(options.optionsForFile(f.app).marker, f.app);
      assert.equal(JSON.parse(fs.readFileSync(f.file)).sha256.uv, hash(f.uv));
      events.push("outer-sealed");
    }, verify: file => events.push(file === f.uv ? "verify-child" : "verify-app"),
  });
  assert.deepEqual(events, ["child-signed", "verify-child", "outer-sealed", "verify-app"]);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).sha256["core.whl"], f.manifest.sha256["core.whl"]);
});
test("modified input cannot be blessed by the signing hook", async t => {
  const f = fixture(t); fs.appendFileSync(f.uv, "tampered");
  let called = false;
  await assert.rejects(signWithRuntimeManifest(f.options, { sign: async () => { called = true; } }), /before signing/);
  assert.equal(called, false);
});
test("skipped native launcher and wheel modifications fail before sealing", async t => {
  for (const modify of [false, true]) {
    const f = fixture(t);
    await assert.rejects(signWithRuntimeManifest(f.options, {
      sign: async opts => {
        if (modify) { opts.optionsForFile(f.uv); fs.appendFileSync(f.wheel, "changed"); }
        opts.optionsForFile(f.app);
      }, verify: () => {},
    }), modify ? /wheel changed/ : /skipped/);
  }
});
test("bad signatures and post-seal changes do not pass package signing", async t => {
  for (const after of [false, true]) {
    const f = fixture(t);
    await assert.rejects(signWithRuntimeManifest(f.options, {
      sign: async opts => { opts.optionsForFile(f.uv); opts.optionsForFile(f.app); if (after) fs.appendFileSync(f.uv, "changed"); },
      verify: () => { if (!after) throw new Error("invalid signature"); },
    }), after ? /after the application seal/ : /invalid signature/);
  }
});
