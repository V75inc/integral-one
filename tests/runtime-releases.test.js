"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { validate, discover, download, publishedWheel } = require("../desktop/runtime-updates/releases");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const options = { oneVersion: "0.1.9", channel: "development", platform: "darwin", arch: "arm64" };
function manifest() { return { schemaVersion: 1, product: "integral-one-runtime", channel: "development", hostContractVersion: 1, minimumOneVersion: "0.1.9", maximumOneVersionExclusive: "0.2.0", platforms: ["darwin-arm64"], core: { version: "0.1.1rc36", registry: "testpypi", wheelSha256: "a".repeat(64) }, wheel: { file: "integral_core-0.1.1rc36-py3-none-any.whl", sha256: "b".repeat(64) }, payload: { file: "integral-one-runtime-0.1.1rc36.zip", sha256: "c".repeat(64), bytes: 20 }, source: { one: "d".repeat(40), core: "e".repeat(40) } }; }
function wheel() { return { filename: "integral_core-0.1.1rc36-py3-none-any.whl", packagetype: "bdist_wheel", yanked: false, size: 12, url: "https://test-files.pythonhosted.org/core.whl", digests: { sha256: "a".repeat(64) } }; }
test("runtime contracts bind host, platform, product, package index, version and bounded artifact names", () => {
  assert.equal(validate(manifest(), options).core.version, "0.1.1rc36");
  for (const changes of [{ oneVersion: "0.1.8" }, { oneVersion: "0.2.0" }, { platform: "win32", arch: "x64" }, { channel: "stable" }]) assert.throws(() => validate(manifest(), { ...options, ...changes }));
  for (const mutate of [m => m.hostContractVersion = 2, m => m.product = "other", m => m.payload.file = "../runtime.zip", m => m.wheel.file = "../core.whl", m => m.core.registry = "pypi", m => m.payload.bytes = 1024 ** 3, m => m.minimumOneVersion = "0.1.0"]) { const m = manifest(); mutate(m); assert.throws(() => validate(m, options)); }
});
test("withdrawn, changed and foreign-host package publications are rejected", () => {
  assert.equal(publishedWheel([wheel()], manifest().core, "testpypi").size, 12);
  for (const mutate of [w => w.yanked = true, w => w.digests.sha256 = "0".repeat(64), w => w.url = "https://evil.example/core.whl", w => w.url += "?token=private", w => w.size = 100_000_000]) { const w = wheel(); mutate(w); assert.throws(() => publishedWheel([w], manifest().core, "testpypi")); }
});
test("discovery uses real index identity and only complete public runtime tags", async () => {
  const m = manifest(), requests = [], release = { tag_name: "core-v0.1.1rc36", draft: false, prerelease: true, assets: [{ name: "runtime-manifest.json" }, { name: m.payload.file }] };
  const request = async (url, opts) => { requests.push({ url, opts }); assert.equal(opts.credentials, "omit"); return Response.json(url.includes("test.pypi.org") ? { releases: { "0.1.1rc36": [wheel()] } } : url.endsWith("runtime-manifest.json") ? m : [release]); };
  const result = await discover({ ...options, currentCore: "0.1.1rc35", request });
  assert.equal(result.candidate.manifest.core.version, "0.1.1rc36"); assert.equal(requests.length, 3);
  release.draft = true; assert.equal((await discover({ ...options, currentCore: "0.1.1rc35", request })).candidate, null);
  release.draft = false; release.assets.pop(); await assert.rejects(discover({ ...options, currentCore: "0.1.1rc35", request }), /Incomplete/);
});
test("no newer compatible package means no release feed request or downgrade", async () => {
  let requests = 0; const request = async () => { requests++; return Response.json({ releases: { "0.1.1rc35": [wheel()], "0.2.0": [wheel()] } }); };
  assert.equal((await discover({ ...options, currentCore: "0.1.1rc35", request })).candidate, null); assert.equal(requests, 1);
});
test("binary downloads enforce HTTPS/redirect hosts/size/hash and never retain corrupt files", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "one-runtime-download-")); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const data = Buffer.from("verified runtime payload"), file = path.join(root, "payload.zip");
  const request = async url => url.startsWith("https://github.com/") ? new Response(null, { status: 302, headers: { location: "https://release-assets.githubusercontent.com/payload" } }) : new Response(data);
  await download("https://github.com/payload", file, { bytes: data.length, sha256: hash(data), request }); assert.deepEqual(fs.readFileSync(file), data);
  for (const params of [{ bytes: data.length - 1, sha256: hash(data) }, { bytes: data.length, sha256: "0".repeat(64) }]) { const rejected = path.join(root, crypto.randomUUID()); await assert.rejects(download("https://github.com/payload", rejected, { ...params, request })); assert.equal(fs.existsSync(rejected), false); }
  await assert.rejects(download("http://github.com/payload", path.join(root, "http"), { bytes: data.length, sha256: hash(data), request }), /origin/);
  await assert.rejects(download("https://github.com/payload", path.join(root, "foreign"), { bytes: data.length, sha256: hash(data), request: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/payload" } }) }), /origin/);
  await assert.rejects(download("https://test-files.pythonhosted.org/payload", path.join(root, "package"), { bytes: data.length, sha256: hash(data), packageFile: true, request: async () => new Response(null, { status: 302, headers: { location: "https://files.pythonhosted.org/payload" } }) }), /redirect/);
});
test('an incompatible newer runtime does not hide a compatible older update',async()=>{
 const newer=manifest();newer.core.version='0.1.1rc37';newer.wheel.file='integral_core-0.1.1rc37-py3-none-any.whl';newer.payload.file='integral-one-runtime-0.1.1rc37.zip';newer.minimumOneVersion='0.1.10';
 const newerWheel={...wheel(),filename:newer.wheel.file}, older=manifest();
 const request=async url=>Response.json(url.includes('test.pypi.org')?{releases:{'0.1.1rc36':[wheel()],'0.1.1rc37':[newerWheel]}}:url.endsWith('runtime-manifest.json')?(url.includes('rc37')?newer:older):[newer,older].map(m=>({tag_name:'core-v'+m.core.version,draft:false,prerelease:true,assets:[{name:'runtime-manifest.json'},{name:m.payload.file}]})));
 const result=await discover({...options,currentCore:'0.1.1rc35',request});assert.equal(result.latestCore,'0.1.1rc37');assert.equal(result.candidate.manifest.core.version,'0.1.1rc36');
});
