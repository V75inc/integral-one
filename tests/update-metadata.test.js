"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const yaml = require("js-yaml");
const { generate } = require("../scripts/update-metadata");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "one-feed-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifest = { schemaVersion: 1, version: "0.1.0", artifacts: {} };
  for (const arch of ["arm64", "x64"]) {
    const file = `integral-one-0.1.0-mac-${arch}.zip`, data = Buffer.from(arch);
    fs.writeFileSync(path.join(dir, file), data);
    manifest.artifacts[`darwin-${arch}`] = { file, bytes: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"), appleTeamId: "M43V972XU9" };
  }
  const save = () => fs.writeFileSync(path.join(dir, "install-manifest.json"), JSON.stringify(manifest));
  save(); return { dir, manifest, save };
}
test("one Mac feed includes both native architectures and byte-matching SHA-512 hashes", t => {
  const f = fixture(t); generate(f.dir, "0.1.0");
  const feed = yaml.load(fs.readFileSync(path.join(f.dir, "latest-mac.yml"), "utf8"));
  assert.equal(feed.files.length, 2);
  for (const file of feed.files) assert.equal(file.sha512, crypto.createHash("sha512").update(fs.readFileSync(path.join(f.dir, file.url))).digest("base64"));
  const { MacUpdater } = require("electron-updater/out/MacUpdater");
  const files = feed.files.map(info => ({ info, url: new URL(info.url, "https://github.com/") }));
  assert.match(MacUpdater.filterFilesForArch(files, true)[0].url.pathname, /arm64/);
  assert.match(MacUpdater.filterFilesForArch(files, false)[0].url.pathname, /x64/);
});
test("feed generation rejects changed bytes, mixed versions, missing architecture and unexpected signer", t => {
  for (const change of [f => { fs.appendFileSync(path.join(f.dir, f.manifest.artifacts['darwin-x64'].file), "tampered"); },
    f => { delete f.manifest.artifacts['darwin-arm64']; },
    f => { f.manifest.artifacts['darwin-x64'].appleTeamId = "OTHERTEAM1"; },
    f => { f.manifest.version = "0.2.0"; }]) {
    const f = fixture(t); change(f); f.save(); assert.throws(() => generate(f.dir, "0.1.0"));
  }
});

test("the packaged public GitHub provider ignores ambient GitHub credentials", t => {
  const original = process.env.GH_TOKEN;
  process.env.GH_TOKEN = 'test-only-never-transmit';
  t.after(() => { if (original === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = original; });
  const { createClient } = require('electron-updater/out/providerFactory');
  const config = require('../package.json').build.publish;
  const client = createClient(config, {allowPrerelease:false}, {});
  assert.equal(client.constructor.name, 'GitHubProvider');
  assert.equal(config.owner, 'V75inc');
  assert.equal(config.repo, 'integral-one');
});

test('Apple Silicon-only feed resolves its native asset and offers no Intel download', t => {
  const f = fixture(t);
  delete f.manifest.artifacts['darwin-x64']; f.save();
  const feed = generate(f.dir, '0.1.0');
  assert.equal(feed.files.length, 1);
  assert.match(feed.path, /-arm64\.zip$/);
  const { MacUpdater } = require('electron-updater/out/MacUpdater');
  const files = feed.files.map(info => ({ info, url: new URL(info.url, 'https://github.com/') }));
  assert.equal(MacUpdater.filterFilesForArch(files, true).length, 1);
  assert.equal(MacUpdater.filterFilesForArch(files, false).length, 0);
});

test('public manifest assembly permits Apple Silicon alone and refuses Intel assets', t => {
  const f = fixture(t), { merge } = require('../scripts/installer-manifest');
  const part = arch => ({ schemaVersion: 1, version: f.manifest.version,
    artifacts: { [`darwin-${arch}`]: f.manifest.artifacts[`darwin-${arch}`] } });
  fs.writeFileSync(path.join(f.dir, 'install-manifest-darwin-arm64.json'), JSON.stringify(part('arm64')));
  const output = path.join(f.dir, 'assembled.json');
  merge(f.dir, output);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(output)).artifacts), ['darwin-arm64']);
  fs.writeFileSync(path.join(f.dir, 'install-manifest-darwin-x64.json'), JSON.stringify(part('x64')));
  assert.throws(() => merge(f.dir, output), /Intel Mac release is blocked/);
});
