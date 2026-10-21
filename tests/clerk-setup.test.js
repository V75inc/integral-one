"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateConfig } = require("../desktop/accounts/config");
const {
  loadState,
  readState,
  privateFile,
  saveReceipt,
} = require("../desktop/accounts/receipt");
const {
  verifyClerkSession,
  verifyAccount,
  saveClerkSetup,
} = require("../desktop/accounts/clerk-setup");
const { createController } = require("../desktop/accounts/controller");
const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  kid: "clerk-test",
  alg: "RS256",
  use: "sig",
};
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "one-clerk-setup-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const config = validateConfig({
    contractVersion: 2,
    setupMode: "clerk",
    provider: "clerk",
    configured: true,
    environment: "production",
    clerkIssuer: "https://auth.example.com",
    publishableKey:
      "pk_live_" + Buffer.from("auth.example.com$").toString("base64"),
  });
  const state = loadState(home),
    now = Date.now();
  const claims = {
    v: 2,
    iss: config.clerkIssuer,
    azp: "integral-one://account",
    sub: "user_original",
    sid: "sess_original",
    iat: Math.floor(now / 1000),
    nbf: Math.floor(now / 1000) - 5,
    exp: Math.floor(now / 1000) + 60,
    integral_one_email: "owner@example.com",
    integral_one_email_verified: true,
    integral_one_name: "Owner",
  };
  function token(delta = {}, header = {}) {
    const parts = [
      { alg: "RS256", typ: "JWT", kid: jwk.kid, ...header },
      { ...claims, ...delta },
    ].map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"));
    return (
      parts.join(".") +
      "." +
      crypto
        .sign("RSA-SHA256", Buffer.from(parts.join(".")), keys.privateKey)
        .toString("base64url")
    );
  }
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ keys: [jwk] }));
  };
  return { home, config, state, now, claims, token, request, calls };
}
test("Clerk-only public configuration needs no service or secret; legacy mode remains explicit", (t) => {
  const f = fixture(t);
  assert.equal(f.config.activationUrl, undefined);
  assert.throws(
    () => validateConfig({ ...f.config, contractVersion: 1 }),
    /v2/,
  );
  for (const delta of [
    { setupMode: "unknown" },
    { secretKey: "forbidden" },
    { clerkIssuer: "https://auth.example.com/path" },
    { publicKeys: { missingOrigin: "key" } },
  ])
    assert.throws(() => validateConfig({ ...f.config, ...delta }));
});
test("verified signup requests only fixed public JWKS and persists no reusable cloud credentials", async (t) => {
  const f = fixture(t),
    token = f.token();
  await saveClerkSetup(f.home, f.state, token, f.config, f.request);
  const state = readState(f.home),
    text = fs.readFileSync(
      path.join(f.home, "one-account/activation.json"),
      "utf8",
    );
  assert.ok(state.localSetup);
  assert.ok(!text.includes(token));
  assert.ok(!text.includes("sess_original"));
  assert.equal(
    verifyAccount(f.home, state, f.config).profile.email,
    "owner@example.com",
  );
  assert.equal(f.calls.length, 1);
  assert.equal(
    f.calls[0].url,
    "https://auth.example.com/.well-known/jwks.json",
  );
  assert.equal(f.calls[0].options.redirect, "error");
  assert.equal(f.calls[0].options.headers, undefined);
  if (process.platform !== "win32")
    for (const name of ["activation.json", "setup-key.json"])
      assert.equal(
        fs.statSync(path.join(f.home, "one-account", name)).mode & 0o777,
        0o600,
      );
});
for (const delta of [
  { iss: "https://foreign.example" },
  { azp: "https://foreign.example" },
  { azp: undefined },
  { exp: 1 },
  { exp: undefined },
  { iat: 9999999999 },
  { nbf: 9999999999 },
  { sid: undefined },
  { v: 1 },
  { sts: "pending" },
  { act: { sub: "user_actor" } },
  { integral_one_email_verified: false },
  { integral_one_email_verified: "true" },
  { integral_one_email: "invalid" },
  { integral_one_name: "x".repeat(257) },
])
  test(`fresh signup rejects invalid claims ${JSON.stringify(delta)}`, async (t) => {
    const f = fixture(t);
    await assert.rejects(
      saveClerkSetup(f.home, f.state, f.token(delta), f.config, f.request),
    );
    assert.equal(readState(f.home).localSetup, undefined);
    assert.equal(
      fs.existsSync(path.join(f.home, "one-account/setup-key.json")),
      false,
    );
  });
test("signature substitutions, remote key injection, duplicate keys and oversized key responses fail closed", async (t) => {
  const f = fixture(t);
  for (const header of [
    { alg: "none" },
    { kid: "other" },
    { jku: "https://attacker.test" },
    { x5u: "https://attacker.test" },
    { crit: ["custom"] },
  ])
    await assert.rejects(
      verifyClerkSession(f.token({}, header), f.config, f.request),
    );
  const parts = f.token().split(".");
  parts[2] = Buffer.alloc(256).toString("base64url");
  await assert.rejects(
    verifyClerkSession(parts.join("."), f.config, f.request),
  );
  await assert.rejects(
    verifyClerkSession(
      f.token(),
      f.config,
      async () => new Response(JSON.stringify({ keys: [jwk, jwk] })),
    ),
  );
  await assert.rejects(
    verifyClerkSession(
      f.token(),
      f.config,
      async () => new Response(" ".repeat(65537)),
    ),
    /signing keys/,
  );
});
test("outage cannot complete fresh setup or write a partial setup record", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    saveClerkSetup(f.home, f.state, f.token(), f.config, async () => {
      throw new Error("offline");
    }),
  );
  assert.equal(readState(f.home).localSetup, undefined);
});
test("foreign account cannot replace a linked workspace; repeat sign-in preserves installation identity", async (t) => {
  const f = fixture(t);
  await saveClerkSetup(f.home, f.state, f.token(), f.config, f.request);
  const before = fs.readFileSync(
    path.join(f.home, "one-account/activation.json"),
    "utf8",
  );
  await assert.rejects(
    saveClerkSetup(
      f.home,
      f.state,
      f.token({ sub: "user_foreign" }),
      f.config,
      f.request,
    ),
    /linked/,
  );
  assert.equal(
    fs.readFileSync(path.join(f.home, "one-account/activation.json"), "utf8"),
    before,
  );
  await saveClerkSetup(f.home, f.state, f.token(), f.config, f.request);
  assert.equal(readState(f.home).installationId, f.state.installationId);
  await assert.rejects(
    saveClerkSetup(
      f.home,
      f.state,
      f.token(),
      { ...f.config, clerkIssuer: "https://foreign.example" },
      f.request,
    ),
  );
});
test("concurrent signup completion cannot replace the winning account", async (t) => {
  const f = fixture(t);
  const results = await Promise.allSettled([
    saveClerkSetup(f.home, f.state, f.token(), f.config, f.request),
    saveClerkSetup(
      f.home,
      f.state,
      f.token({ sub: "user_foreign" }),
      f.config,
      f.request,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});
test("legacy receipt upgrades without changing its bytes, keys, installation ID or account", async (t) => {
  const f = fixture(t),
    legacy = crypto.generateKeyPairSync("ed25519");
  f.config.activationUrl = f.config.issuer = "https://accounts.example.com";
  f.config.publicKeys = {
    legacy: legacy.publicKey.export({ type: "spki", format: "pem" }),
  };
  const parts = [
    { alg: "EdDSA", typ: "integral-one-activation+jwt", kid: "legacy" },
    {
      v: 1,
      aud: "integral-one-local-activation",
      product: "integral-one",
      iss: f.config.issuer,
      clerk_issuer: f.config.clerkIssuer,
      sub: "user_original",
      installation_id: f.state.installationId,
      activated_at: "2026-10-18T12:00:00Z",
    },
  ].map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"));
  const code =
    parts.join(".") +
    "." +
    crypto
      .sign(null, Buffer.from(parts.join(".")), legacy.privateKey)
      .toString("base64url");
  saveReceipt(f.home, f.state, code, f.config);
  await assert.rejects(
    saveClerkSetup(
      f.home,
      f.state,
      f.token({ sub: "user_foreign" }),
      f.config,
      f.request,
    ),
    /linked/,
  );
  await saveClerkSetup(f.home, f.state, f.token(), f.config, f.request);
  assert.equal(readState(f.home).receipt, code);
  assert.equal(
    verifyAccount(f.home, readState(f.home), f.config).sub,
    "user_original",
  );
  assert.throws(
    () => saveReceipt(f.home, readState(f.home), code, f.config),
    /sign-in/,
  );
});
test("tampered, transplanted or missing-key setup needs recovery without regenerating it", async (t) => {
  const f = fixture(t);
  await saveClerkSetup(f.home, f.state, f.token(), f.config, f.request);
  const state = readState(f.home);
  assert.throws(() =>
    verifyAccount(
      f.home,
      { ...state, installationId: crypto.randomUUID() },
      f.config,
    ),
  );
  const payload = JSON.parse(
    Buffer.from(state.localSetup.payload, "base64url"),
  );
  payload.sub = "user_foreign";
  assert.throws(() =>
    verifyAccount(
      f.home,
      {
        ...state,
        localSetup: {
          ...state.localSetup,
          payload: Buffer.from(JSON.stringify(payload)).toString("base64url"),
        },
      },
      f.config,
    ),
  );
  fs.unlinkSync(path.join(f.home, "one-account/setup-key.json"));
  await assert.rejects(
    saveClerkSetup(f.home, f.state, f.token(), f.config, f.request),
  );
  assert.equal(
    fs.existsSync(path.join(f.home, "one-account/setup-key.json")),
    false,
  );
});
test("cold restart, sign-out and offline re-entry need no cloud session or network", async (t) => {
  const f = fixture(t);
  await saveClerkSetup(f.home, f.state, f.token(), f.config, f.request);
  const { EventEmitter } = require("node:events"),
    handlers = new Map();
  const controller = createController({
    config: f.config,
    createBridge: () => ({ cleanup() {} }),
    request: () => assert.fail("Offline access must not call Clerk"),
    electron: {
      app: new EventEmitter(),
      clipboard: {},
      session: {
        fromPartition: () =>
          assert.fail("Offline access must not create an account session"),
      },
      ipcMain: {
        handle: (n, fn) => handlers.set(n, fn),
        removeHandler: (n) => handlers.delete(n),
      },
      BrowserWindow: class {
        constructor() {
          assert.fail("No account window on offline boot");
        }
      },
    },
  });
  const previous = process.env.INTEGRAL_HOME;
  process.env.INTEGRAL_HOME = f.home;
  t.after(() => {
    controller.cleanup();
    if (previous === undefined) delete process.env.INTEGRAL_HOME;
    else process.env.INTEGRAL_HOME = previous;
  });
  await controller.beforeBoot({ userData: f.home });
  assert.equal(controller.accountProfile().email, "owner@example.com");
  controller.signOut();
  assert.throws(() => controller.authorizeSession(), /Sign in/);
  controller.resumeOffline();
  controller.authorizeSession();
  assert.equal(readState(f.home).installationId, f.state.installationId);
});
