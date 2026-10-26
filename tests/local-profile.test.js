"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createProfileInitializer } = require("../desktop/accounts/local-profile");

function fixture(t, displayName = "Owner") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "one-profile-"));
  fs.mkdirSync(path.join(home, "one-account"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const runtime = { home, installation_id: "test-installation", web_url: "http://127.0.0.1:19006/" };
  const f = { runtime, profile: { name: "  Ada Example  " }, user: { id: "local-owner", display_name: displayName }, calls: [], signedOut: false, fail: false };
  f.marker = path.join(home, "one-account/profile-initialized.json");
  f.initialize = createProfileInitializer({
    getProfile: () => f.profile,
    authorize: () => { if (f.signedOut) throw new Error("signed out"); },
    exchange: async actual => { assert.equal(actual, runtime); return { access_token: "local-session" }; },
    request: async (url, options) => {
      assert.equal(url.origin, new URL(runtime.web_url).origin);
      assert.equal(options.headers.Authorization, "Bearer local-session");
      assert.equal(options.redirect, "error");
      f.calls.push({ route: url.pathname, method: options.method, body: options.body });
      if (f.fail) return { ok: false };
      if (options.method === "PUT") Object.assign(f.user, JSON.parse(options.body));
      return { ok: true, json: async () => ({ user: { ...f.user } }) };
    },
  });
  return f;
}

for (const name of ["Owner", "", "   "]) test(`initializes the saved default ${JSON.stringify(name)} from the account`, async t => {
  const f = fixture(t, name); await f.initialize(f.runtime);
  assert.equal(f.user.display_name, "Ada Example");
  assert.equal(f.calls[1].body, JSON.stringify({ display_name: "Ada Example" }));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.marker)), { v: 1, installationId: f.runtime.installation_id });
  assert.ok(!fs.readFileSync(f.marker, "utf8").includes("Ada"));
  if (process.platform !== "win32") assert.equal(fs.statSync(f.marker).mode & 0o777, 0o600);
});

test("preserves an existing local name and never substitutes a renderer-only name", async t => {
  const f = fixture(t, "Chosen Local Name"); await f.initialize(f.runtime);
  assert.equal(f.user.display_name, "Chosen Local Name"); assert.equal(f.calls.length, 1);
  assert.ok(fs.existsSync(f.marker));
});

test("later sign-ins and cold starts preserve edits, including a deliberate Owner name", async t => {
  const f = fixture(t); await f.initialize(f.runtime);
  f.user.display_name = "Owner"; f.profile.name = "Changed Cloud Name";
  await f.initialize(f.runtime);
  assert.equal(f.user.display_name, "Owner"); assert.equal(f.calls.length, 2);
  const restarted = createProfileInitializer({ getProfile: () => f.profile, authorize() {}, exchange: () => assert.fail("Must not reinitialize") });
  await restarted(f.runtime);
});

test("missing account names are deferred and a later real name initializes once", async t => {
  const f = fixture(t); f.profile.name = " "; await f.initialize(f.runtime);
  assert.equal(f.calls.length, 0); assert.equal(fs.existsSync(f.marker), false);
  f.profile.name = "New Name"; await f.initialize(f.runtime);
  assert.equal(f.user.display_name, "New Name");
});

test("failed local requests leave initialization retryable", async t => {
  const f = fixture(t); f.fail = true;
  await assert.rejects(f.initialize(f.runtime), /could not be initialized/);
  assert.equal(fs.existsSync(f.marker), false);
  f.fail = false; await f.initialize(f.runtime); assert.equal(f.user.display_name, "Ada Example");
});

test("signed-out sessions cannot initialize a profile", async t => {
  const f = fixture(t); f.signedOut = true;
  await assert.rejects(f.initialize(f.runtime), /signed out/); assert.equal(f.calls.length, 0);
});

test("concurrent initialization coalesces and persists only once", async t => {
  const f = fixture(t); await Promise.all([f.initialize(f.runtime), f.initialize(f.runtime)]);
  assert.equal(f.calls.length, 2);
});

test("foreign or malformed markers are preserved without changing the profile", async t => {
  const f = fixture(t);
  for (const contents of ['{"v":1,"installationId":"other"}', "invalid"]) {
    fs.writeFileSync(f.marker, contents);
    await assert.rejects(f.initialize(f.runtime));
    assert.equal(fs.readFileSync(f.marker, "utf8"), contents); assert.equal(f.calls.length, 0);
  }
});

test("profile markers cannot redirect writes through a symlink", { skip: process.platform === "win32" }, async t => {
  const f = fixture(t), target = path.join(f.runtime.home, "retained"); fs.writeFileSync(target, "preserve"); fs.symlinkSync(target, f.marker);
  await assert.rejects(f.initialize(f.runtime), /recovery/);
  assert.equal(fs.readFileSync(target, "utf8"), "preserve"); assert.equal(f.calls.length, 0);
});
