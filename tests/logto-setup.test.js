"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { validateConfig } = require("../desktop/accounts/config");
const { createController } = require("../desktop/accounts/controller");
const { loadState, privateFile, readState, saveReceipt } = require("../desktop/accounts/receipt");
const { saveClerkSetup } = require("../desktop/accounts/clerk-setup");
const {
  authorizationUrl,
  createAttempt,
  saveLogtoSetup,
  verifyLogtoSetup,
} = require("../desktop/accounts/logto-setup");

const ISSUER = "https://auth.saas.apps.trueselph.com/oidc";
const TOKEN_URL = `${ISSUER}/token`;
const JWKS_URL = `${ISSUER}/jwks`;
const APP_ID = "app_public_test";
const CODE = "sentinel-auth-code";
const ACCESS = "sentinel-access-token";
const REFRESH = "sentinel-refresh-token";
const SUBJECT = "logto-subject-1";
const pair = crypto.generateKeyPairSync("ec", { namedCurve: "secp384r1" });
const jwk = {
  ...pair.publicKey.export({ format: "jwk" }),
  kid: "logto-test",
  alg: "ES384",
  use: "sig",
};
const p256 = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const p256Jwk = {
  ...p256.publicKey.export({ format: "jwk" }),
  kid: jwk.kid,
  alg: "ES256",
  use: "sig",
};

function token(attempt, delta = {}, header = {}, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const claims = {
    iss: ISSUER,
    aud: APP_ID,
    sub: SUBJECT,
    nonce: attempt.nonce,
    iat: issued,
    exp: issued + 3600,
    email_verified: true,
    email: "owner@example.com",
    name: "Owner",
    ...delta,
  };
  for (const key of Object.keys(claims))
    if (claims[key] === undefined) delete claims[key];
  const parts = [
    { alg: "ES384", kid: jwk.kid, ...header },
    claims,
  ].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"));
  const signature = crypto.sign(
    "sha384",
    Buffer.from(parts.join(".")),
    { key: pair.privateKey, dsaEncoding: "ieee-p1363" },
  );
  return `${parts.join(".")}.${signature.toString("base64url")}`;
}

function accountPath(home, name) {
  return path.join(home, "one-account", name);
}

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "one-logto-setup-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const state = loadState(home);
  const now = Date.now();
  const attempt = createAttempt();
  const calls = [];
  let idToken = "";
  const request = async (url, options) => {
    calls.push({ url, options });
    if (url === TOKEN_URL)
      return new Response(
        JSON.stringify({
          id_token: idToken,
          access_token: ACCESS,
          refresh_token: REFRESH,
          token_type: "Bearer",
        }),
      );
    if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
    throw new Error(`Unexpected account request ${url}`);
  };
  function issue(delta = {}, header = {}) {
    idToken = token(attempt, delta, header, now);
    return idToken;
  }
  function exchange(requestImpl = request, code = CODE, next = attempt) {
    return saveLogtoSetup(
      home,
      state,
      { code, attempt: next, appId: APP_ID },
      requestImpl,
      now,
    );
  }
  function assertNothingWritten() {
    assert.equal(readState(home).localSetup, undefined);
    assert.equal(fs.existsSync(accountPath(home, "setup-key.json")), false);
  }
  return {
    home,
    state,
    now,
    attempt,
    calls,
    issue,
    exchange,
    assertNothingWritten,
    request,
  };
}

function claimCases() {
  return [
    ["wrong alg", {}, { alg: "none" }],
    ["wrong issuer", { iss: "https://evil.example/oidc" }, {}],
    ["wrong audience", { aud: "other-app" }, {}],
    ["audience list", { aud: [APP_ID] }, {}],
    ["wrong nonce", { nonce: "other-nonce" }, {}],
    ["email without one @", { email: "owner.example.com" }, {}],
    ["name longer than 256", { name: "n".repeat(257) }, {}],
    ["email longer than 320", { email: `${"a".repeat(310)}@example.com` }, {}],
    ["empty sub", { sub: "" }, {}],
    ["sub longer than 128", { sub: "s".repeat(129) }, {}],
    ["expired exp", {}, {}],
    ["exp more than one hour after iat", {}, {}],
    ["iat older than five minutes", {}, {}],
    ["iat more than five seconds ahead", {}, {}],
    ["nbf more than five seconds ahead", {}, {}],
  ];
}

function timedDelta(label, issued, delta) {
  if (label === "expired exp") return { exp: issued - 1 };
  if (label === "exp more than one hour after iat") return { exp: issued + 3601 };
  if (label === "iat older than five minutes")
    return { iat: issued - 301, exp: issued + 60 };
  if (label === "iat more than five seconds ahead")
    return { iat: issued + 6, exp: issued + 120 };
  if (label === "nbf more than five seconds ahead") return { nbf: issued + 6 };
  return delta;
}

test("a PKCE attempt builds the pinned authorization URL", () => {
  const attempt = createAttempt();
  assert.match(attempt.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(attempt.state, attempt.nonce);
  assert.equal(
    attempt.challenge,
    crypto.createHash("sha256").update(attempt.verifier).digest("base64url"),
  );
  const url = new URL(authorizationUrl(APP_ID, attempt));
  assert.equal(url.origin + url.pathname, `${ISSUER}/auth`);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), APP_ID);
  assert.equal(url.searchParams.get("redirect_uri"), "integral-one://account/callback");
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), attempt.challenge);
  assert.equal(url.searchParams.get("state"), attempt.state);
  assert.equal(url.searchParams.get("nonce"), attempt.nonce);
  for (const name of ["client_secret", "resource", "organization", "offline_access"])
    assert.equal(url.searchParams.has(name), false);
});

test("a verified exchange calls only the pinned token and JWKS URLs and writes version 3", async (t) => {
  const f = fixture(t);
  const idToken = f.issue();
  assert.equal(Buffer.from(idToken.split(".")[2], "base64url").length, 96);
  const identity = await f.exchange();
  assert.equal(identity.sub, SUBJECT);
  assert.equal(identity.issuer, ISSUER);
  assert.deepEqual(identity.profile, {
    email: "owner@example.com",
    name: "Owner",
  });
  assert.equal(identity.id_token, undefined);
  assert.equal(identity.access_token, undefined);
  assert.equal(identity.refresh_token, undefined);
  assert.deepEqual(
    f.calls.map((call) => call.url),
    [TOKEN_URL, JWKS_URL],
  );
  const tokenCall = f.calls[0];
  const params = new URLSearchParams(tokenCall.options.body);
  assert.equal(tokenCall.options.method, "POST");
  assert.equal(tokenCall.options.redirect, "error");
  assert.equal(tokenCall.options.credentials, "omit");
  assert.equal(
    tokenCall.options.headers["content-type"],
    "application/x-www-form-urlencoded",
  );
  assert.equal(tokenCall.options.headers.authorization, undefined);
  assert.ok(tokenCall.options.signal instanceof AbortSignal);
  assert.equal(params.get("grant_type"), "authorization_code");
  assert.equal(params.get("code"), CODE);
  assert.equal(params.get("code_verifier"), f.attempt.verifier);
  assert.equal(params.get("client_id"), APP_ID);
  assert.equal(params.get("redirect_uri"), "integral-one://account/callback");
  assert.equal(params.get("client_secret"), null);
  assert.equal(f.calls[1].options.redirect, "error");
  assert.equal(f.calls[1].options.credentials, "omit");
  assert.equal(f.calls[1].options.headers, undefined);
  const stored = verifyLogtoSetup(f.home, readState(f.home));
  assert.equal(stored.v, 3);
  assert.equal(stored.product, "integral-one");
  assert.equal(stored.installation_id, f.state.installationId);
  assert.equal(stored.issuer, ISSUER);
  assert.equal(stored.sub, SUBJECT);
  assert.equal(stored.profile.email, "owner@example.com");
  assert.equal(stored.profile.name, "Owner");
  assert.equal(Object.hasOwn(stored, "exp"), false);
  assert.ok(Number.isFinite(Date.parse(stored.completed_at)));
  for (const name of ["activation.json", "setup-key.json"]) {
    const text = fs.readFileSync(accountPath(f.home, name), "utf8");
    for (const secret of [idToken, ACCESS, REFRESH, CODE, f.attempt.verifier])
      assert.equal(text.includes(secret), false, name);
  }
  if (process.platform !== "win32")
    for (const name of ["activation.json", "setup-key.json"])
      assert.equal(
        fs.statSync(accountPath(f.home, name)).mode & 0o777,
        0o600,
      );
});

test("an empty name is stored and a later sign-in reuses the setup key", async (t) => {
  const f = fixture(t);
  f.issue({ name: "" });
  await f.exchange();
  assert.equal(verifyLogtoSetup(f.home, readState(f.home)).profile.name, "");
  const key = fs.readFileSync(accountPath(f.home, "setup-key.json"));
  f.issue({ name: "" });
  await f.exchange();
  assert.equal(
    fs.readFileSync(accountPath(f.home, "setup-key.json")).equals(key),
    true,
  );
  assert.equal(readState(f.home).installationId, f.state.installationId);
});

test("an unverified email is accepted and stored", async (t) => {
  const f = fixture(t);
  f.issue({ email_verified: false, email: "unverified@example.com" });
  await f.exchange();
  const setup = verifyLogtoSetup(f.home, readState(f.home));
  assert.equal(setup.profile.email, "unverified@example.com");
});

test("a string email_verified value is accepted", async (t) => {
  const f = fixture(t);
  f.issue({ email_verified: "true" });
  await f.exchange();
  const setup = verifyLogtoSetup(f.home, readState(f.home));
  assert.equal(setup.profile.email, "owner@example.com");
});

test("a missing name is accepted and defaults to empty", async (t) => {
  const f = fixture(t);
  f.issue({ name: undefined });
  await f.exchange();
  const setup = verifyLogtoSetup(f.home, readState(f.home));
  assert.equal(setup.profile.name, "");
});

test("a username-only sign-in without email or name is accepted", async (t) => {
  const f = fixture(t);
  f.issue({
    email: undefined,
    email_verified: undefined,
    name: undefined,
    username: "jason",
  });
  await f.exchange();
  const setup = verifyLogtoSetup(f.home, readState(f.home));
  assert.equal(setup.profile.name, "jason");
  assert.equal(setup.profile.email, "jason@integral.local");
});

for (const [label, delta, header] of claimCases())
  test(`${label} writes nothing`, async (t) => {
    const f = fixture(t);
    f.issue(timedDelta(label, Math.floor(f.now / 1000), delta), header);
    await assert.rejects(f.exchange());
    f.assertNothingWritten();
    assert.deepEqual(
      f.calls.map((call) => call.url),
      [TOKEN_URL],
    );
  });

test("jku, x5u, and crit write nothing and do not fetch JWKS", async (t) => {
  for (const header of [
    { jku: "https://attacker.test/jwks" },
    { x5u: "https://attacker.test/cert" },
    { crit: ["bork"] },
  ]) {
    const f = fixture(t);
    f.issue({}, header);
    await assert.rejects(f.exchange());
    f.assertNothingWritten();
    assert.deepEqual(
      f.calls.map((call) => call.url),
      [TOKEN_URL],
    );
  }
});

test("a redirect writes nothing", async (t) => {
  const f = fixture(t);
  const idToken = f.issue();
  const redirected = {
    ok: false,
    redirected: true,
    status: 302,
    body: {
      getReader() {
        throw new Error("redirect body was read");
      },
    },
  };
  await assert.rejects(
    f.exchange(async (url) => {
      f.calls.push({ url });
      return redirected;
    }),
  );
  f.assertNothingWritten();
  assert.deepEqual(
    f.calls.map((call) => call.url),
    [TOKEN_URL],
  );
  f.calls.length = 0;
  await assert.rejects(
    f.exchange(async (url) => {
      f.calls.push({ url });
      if (url === TOKEN_URL)
        return new Response(
          JSON.stringify({
            id_token: idToken,
            access_token: ACCESS,
            refresh_token: REFRESH,
          }),
        );
      return redirected;
    }),
  );
  f.assertNothingWritten();
  assert.deepEqual(
    f.calls.map((call) => call.url),
    [TOKEN_URL, JWKS_URL],
  );
});

test("duplicate keys, a non-P-384 key, another alg, or a private key write nothing", async (t) => {
  const cases = [
    [jwk, { ...jwk }],
    [p256Jwk],
    [{ ...jwk, alg: "RS256" }],
    [{ ...jwk, d: "private-scalar" }],
  ];
  for (const keys of cases) {
    const f = fixture(t);
    f.issue();
    await assert.rejects(
      f.exchange(async (url) => {
        if (url === TOKEN_URL)
          return new Response(
            JSON.stringify({
              id_token: token(f.attempt, {}, {}, f.now),
              access_token: ACCESS,
              refresh_token: REFRESH,
            }),
          );
        if (url === JWKS_URL) return new Response(JSON.stringify({ keys }));
        throw new Error(url);
      }),
    );
    f.assertNothingWritten();
  }
});

test("an oversized token or JWKS body writes nothing", async (t) => {
  const f = fixture(t);
  const idToken = f.issue();
  await assert.rejects(
    f.exchange(async () => new Response(`${" ".repeat(65537)}`)),
    /signing keys/,
  );
  f.assertNothingWritten();
  await assert.rejects(
    f.exchange(async (url) => {
      if (url === TOKEN_URL)
        return new Response(
          JSON.stringify({
            id_token: idToken,
            access_token: ACCESS,
            refresh_token: REFRESH,
          }),
        );
      return new Response(`${" ".repeat(65537)}`);
    }),
    /signing keys/,
  );
  f.assertNothingWritten();
});

test("a token-endpoint or JWKS failure writes nothing", async (t) => {
  const f = fixture(t);
  const idToken = f.issue();
  await assert.rejects(
    f.exchange(async () => {
      throw new Error("offline");
    }),
  );
  f.assertNothingWritten();
  await assert.rejects(
    f.exchange(async () => new Response("no", { status: 500 })),
  );
  f.assertNothingWritten();
  await assert.rejects(
    f.exchange(async (url) => {
      if (url === TOKEN_URL)
        return new Response(
          JSON.stringify({
            id_token: idToken,
            access_token: ACCESS,
            refresh_token: REFRESH,
          }),
        );
      throw new Error("jwks offline");
    }),
  );
  f.assertNothingWritten();
  await assert.rejects(
    f.exchange(async (url) => {
      if (url === TOKEN_URL)
        return new Response(
          JSON.stringify({
            id_token: idToken,
            access_token: ACCESS,
            refresh_token: REFRESH,
          }),
        );
      return new Response("no", { status: 500 });
    }),
  );
  f.assertNothingWritten();
});

test("a DER ES384 signature writes nothing", async (t) => {
  const f = fixture(t);
  const issued = Math.floor(f.now / 1000);
  const parts = [
    { alg: "ES384", kid: jwk.kid },
    {
      iss: ISSUER,
      aud: APP_ID,
      sub: SUBJECT,
      nonce: f.attempt.nonce,
      iat: issued,
      exp: issued + 3600,
      email_verified: true,
      email: "owner@example.com",
      name: "Owner",
    },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"));
  const der = crypto
    .sign("sha384", Buffer.from(parts.join(".")), pair.privateKey)
    .toString("base64url");
  await assert.rejects(
    f.exchange(async (url) => {
      if (url === TOKEN_URL)
        return new Response(
          JSON.stringify({
            id_token: `${parts.join(".")}.${der}`,
            access_token: ACCESS,
            refresh_token: REFRESH,
          }),
        );
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      throw new Error(url);
    }),
  );
  f.assertNothingWritten();
});

test("a second subject or issuer cannot replace a linked setup", async (t) => {
  const f = fixture(t);
  f.issue();
  await f.exchange();
  const before = fs.readFileSync(accountPath(f.home, "activation.json"), "utf8");
  const other = createAttempt();
  await assert.rejects(
    f.exchange(
      async (url) => {
        if (url === TOKEN_URL)
          return new Response(
            JSON.stringify({
              id_token: token(other, { sub: "logto-subject-2" }, {}, f.now),
              access_token: ACCESS,
              refresh_token: REFRESH,
            }),
          );
        if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
        throw new Error(url);
      },
      CODE,
      other,
    ),
    /linked/,
  );
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json"), "utf8"),
    before,
  );
  const stored = readState(f.home);
  const payload = JSON.parse(
    Buffer.from(stored.localSetup.payload, "base64url"),
  );
  payload.issuer = "https://other.example/oidc";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = crypto.createPrivateKey(
    JSON.parse(fs.readFileSync(accountPath(f.home, "setup-key.json"), "utf8"))
      .privateKey,
  );
  privateFile(accountPath(f.home, "activation.json"), {
    ...stored,
    localSetup: {
      payload: body,
      signature: crypto.sign(null, Buffer.from(body), key).toString("base64url"),
    },
  });
  const linked = fs.readFileSync(accountPath(f.home, "activation.json"), "utf8");
  f.issue();
  await assert.rejects(f.exchange());
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json"), "utf8"),
    linked,
  );
  assert.equal(readState(f.home).installationId, f.state.installationId);
});

test("overlapping completions cannot replace the winner", async (t) => {
  const f = fixture(t);
  const other = createAttempt();
  const tokens = {
    "winner-code": token(f.attempt, {}, {}, f.now),
    "loser-code": token(other, { sub: "logto-subject-2" }, {}, f.now),
  };
  const request = async (url, options) => {
    if (url === TOKEN_URL) {
      const code = new URLSearchParams(options.body).get("code");
      return new Response(
        JSON.stringify({
          id_token: tokens[code],
          access_token: ACCESS + code,
          refresh_token: REFRESH + code,
        }),
      );
    }
    if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
    throw new Error(url);
  };
  const results = await Promise.allSettled([
    f.exchange(request, "winner-code", f.attempt),
    f.exchange(request, "loser-code", other),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const winner = results.find((result) => result.status === "fulfilled").value;
  assert.equal(verifyLogtoSetup(f.home, readState(f.home)).sub, winner.sub);
});

test("a Clerk version 2 payload is not overwritten", async (t) => {
  const f = fixture(t);
  const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const clerkJwk = {
    ...keys.publicKey.export({ format: "jwk" }),
    kid: "clerk-test",
    alg: "RS256",
    use: "sig",
  };
  const config = {
    contractVersion: 2,
    setupMode: "clerk",
    provider: "clerk",
    configured: true,
    environment: "production",
    clerkIssuer: "https://auth.example.com",
    publishableKey:
      "pk_live_" + Buffer.from("auth.example.com$").toString("base64"),
  };
  const issued = Math.floor(f.now / 1000);
  const parts = [
    { alg: "RS256", typ: "JWT", kid: clerkJwk.kid },
    {
      v: 2,
      iss: config.clerkIssuer,
      azp: "integral-one://account",
      sub: "user_original",
      sid: "sess_original",
      iat: issued,
      nbf: issued - 5,
      exp: issued + 60,
      integral_one_email: "owner@example.com",
      integral_one_email_verified: true,
      integral_one_name: "Owner",
    },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"));
  const clerkToken =
    parts.join(".") +
    "." +
    crypto
      .sign("RSA-SHA256", Buffer.from(parts.join(".")), keys.privateKey)
      .toString("base64url");
  await saveClerkSetup(
    f.home,
    f.state,
    clerkToken,
    config,
    async () => new Response(JSON.stringify({ keys: [clerkJwk] })),
  );
  const before = fs.readFileSync(accountPath(f.home, "activation.json"));
  const keyBefore = fs.readFileSync(accountPath(f.home, "setup-key.json"));
  f.issue();
  await assert.rejects(f.exchange());
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json")).equals(before),
    true,
  );
  assert.equal(
    fs.readFileSync(accountPath(f.home, "setup-key.json")).equals(keyBefore),
    true,
  );
});

test("a legacy receipt is not overwritten", async (t) => {
  const f = fixture(t);
  const legacy = crypto.generateKeyPairSync("ed25519");
  const config = {
    contractVersion: 2,
    setupMode: "clerk",
    provider: "clerk",
    configured: true,
    environment: "production",
    clerkIssuer: "https://auth.example.com",
    publishableKey:
      "pk_live_" + Buffer.from("auth.example.com$").toString("base64"),
  };
  config.activationUrl = config.issuer = "https://accounts.example.com";
  config.publicKeys = {
    legacy: legacy.publicKey.export({ type: "spki", format: "pem" }),
  };
  const parts = [
    { alg: "EdDSA", typ: "integral-one-activation+jwt", kid: "legacy" },
    {
      v: 1,
      aud: "integral-one-local-activation",
      product: "integral-one",
      iss: config.issuer,
      clerk_issuer: config.clerkIssuer,
      sub: "user_original",
      installation_id: f.state.installationId,
      activated_at: "2026-10-18T12:00:00Z",
    },
  ].map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"));
  const code =
    parts.join(".") +
    "." +
    crypto
      .sign(null, Buffer.from(parts.join(".")), legacy.privateKey)
      .toString("base64url");
  saveReceipt(f.home, f.state, code, config);
  const before = fs.readFileSync(accountPath(f.home, "activation.json"), "utf8");
  f.issue();
  await assert.rejects(f.exchange());
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json"), "utf8"),
    before,
  );
  assert.equal(readState(f.home).receipt, code);
  assert.equal(readState(f.home).localSetup, undefined);
  assert.equal(fs.existsSync(accountPath(f.home, "setup-key.json")), false);
});

test("a tampered record is not repaired", async (t) => {
  const f = fixture(t);
  f.issue();
  await f.exchange();
  const state = readState(f.home);
  assert.throws(() =>
    verifyLogtoSetup(f.home, {
      ...state,
      installationId: crypto.randomUUID(),
    }),
  );
  const payload = JSON.parse(Buffer.from(state.localSetup.payload, "base64url"));
  payload.sub = "logto-subject-2";
  const tampered = {
    ...state,
    localSetup: {
      ...state.localSetup,
      payload: Buffer.from(JSON.stringify(payload)).toString("base64url"),
    },
  };
  assert.throws(() => verifyLogtoSetup(f.home, tampered));
  privateFile(accountPath(f.home, "activation.json"), tampered);
  const before = fs.readFileSync(accountPath(f.home, "activation.json"));
  f.issue();
  await assert.rejects(f.exchange());
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json")).equals(before),
    true,
  );
});

test("a missing setup key is not regenerated", async (t) => {
  const f = fixture(t);
  f.issue();
  await f.exchange();
  const before = fs.readFileSync(accountPath(f.home, "activation.json"));
  fs.unlinkSync(accountPath(f.home, "setup-key.json"));
  f.issue();
  await assert.rejects(f.exchange());
  assert.equal(fs.existsSync(accountPath(f.home, "setup-key.json")), false);
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json")).equals(before),
    true,
  );
});

function publicConfig(environment = "production") {
  return {
    contractVersion: 3,
    provider: "logto",
    setupMode: "logto",
    configured: true,
    environment,
    appId: APP_ID,
    issuer: ISSUER,
  };
}

test("a configured public Logto file has only the public fields", () => {
  const production = publicConfig();
  const development = publicConfig("development");
  assert.deepEqual(validateConfig(production), production);
  assert.deepEqual(validateConfig(development), development);
  assert.equal(JSON.stringify(validateConfig(production)).includes("secret"), false);
});

test("a secret, a Clerk field, an unknown field, or another issuer is rejected", () => {
  assert.throws(() =>
    validateConfig({
      contractVersion: 2,
      provider: "clerk",
      setupMode: "clerk",
      configured: true,
      environment: "production",
      clerkIssuer: "https://auth.example.com",
      publishableKey:
        "pk_live_" + Buffer.from("auth.example.com$").toString("base64"),
    }),
  );
  assert.throws(() =>
    validateConfig({
      contractVersion: 1,
      provider: "clerk",
      configured: false,
      publishableKey: "",
      clerkIssuer: "",
      activationUrl: "https://accounts.example.com",
      publicKeys: { first: "not-a-key" },
    }),
  );
  for (const delta of [
    { clientSecret: "not-a-real-secret" },
    { client_secret: "not-a-real-secret" },
    { secretKey: "not-a-real-secret" },
    { publishableKey: "pk_test_example" },
    { clerkIssuer: "https://clerk.example.com" },
    { activationUrl: "https://accounts.example.com" },
    { publicKeys: { first: "pem" } },
    { extra: true },
    { issuer: "https://example.com/oidc" },
    { issuer: "https://auth.saas.apps.trueselph.com/oidc/" },
    { appId: "" },
    { environment: "staging" },
    { provider: "clerk" },
    { setupMode: "clerk" },
    { contractVersion: 2 },
  ])
    assert.throws(() => validateConfig({ ...publicConfig(), ...delta }));
});

test("the checked-in production account config publishes the app id and no secret", () => {
  const file = path.join(
    __dirname,
    "../desktop/accounts/config.production.json",
  );
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const text = fs.readFileSync(file, "utf8");
  assert.equal(raw.configured, true);
  assert.equal(raw.environment, "production");
  assert.equal(raw.appId, "n8k7hws5ydhawj073ksjm");
  assert.equal(validateConfig(raw).appId, raw.appId);
  assert.equal(/secret|private|publishableKey|pk_live_|pk_test_/i.test(text), false);
});

test("the checked-in account config is unconfigured and has no secret", () => {
  const file = path.join(__dirname, "../desktop/accounts/config.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const expected = {
    contractVersion: 3,
    provider: "logto",
    setupMode: "logto",
    configured: false,
    appId: "",
    issuer: ISSUER,
  };
  assert.deepEqual(raw, expected);
  assert.equal(
    /secret|publishableKey|pk_live_|pk_test_/i.test(fs.readFileSync(file, "utf8")),
    false,
  );
  assert.deepEqual(validateConfig(raw), expected);
});

test("an unconfigured config does not open the network", () => {
  const original = globalThis.fetch;
  let opened = false;
  globalThis.fetch = () => {
    opened = true;
    throw new Error("unconfigured config opened the network");
  };
  try {
    const config = validateConfig({
      contractVersion: 3,
      provider: "logto",
      setupMode: "logto",
      configured: false,
      appId: "",
      issuer: ISSUER,
    });
    assert.equal(opened, false);
    assert.equal(config.configured, false);
    assert.equal(config.appId, "");
    assert.equal(Object.hasOwn(config, "clientSecret"), false);
    assert.equal(Object.hasOwn(config, "secretKey"), false);
    assert.equal(Object.hasOwn(config, "publishableKey"), false);
  } finally {
    globalThis.fetch = original;
  }
});

function callbackFrom(auth, { code = CODE, state, error, includeCode = true } = {}) {
  const url = new URL("integral-one://account/callback");
  url.searchParams.set("state", state === undefined ? auth.searchParams.get("state") : state);
  if (includeCode) url.searchParams.set("code", code);
  if (error) url.searchParams.set("error", error);
  return url.toString();
}

function openGate(t, { home, config, request }) {
  const app = new EventEmitter();
  const handlers = new Map();
  const opened = [];
  const schemes = [];
  const sent = [];
  let win = null;
  let windows = 0;
  let protocol = null;
  app.quit = () => app.emit("before-quit");
  app.setAsDefaultProtocolClient = (scheme) => {
    schemes.push(scheme);
    return true;
  };
  const controller = createController({
    config,
    request,
    electron: {
      app,
      clipboard: { writeText() {} },
      shell: {
        openExternal: async (url) => {
          opened.push(url);
        },
      },
      ipcMain: {
        handle: (name, fn) => handlers.set(name, fn),
        removeHandler: (name) => handlers.delete(name),
      },
      session: {
        fromPartition: () => ({
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {},
          protocol: {
            handle(_scheme, fn) {
              protocol = fn;
            },
          },
          async clearStorageData() {},
        }),
      },
      BrowserWindow: class extends EventEmitter {
        constructor() {
          super();
          windows += 1;
          win = this;
          this.webContents = new EventEmitter();
          this.webContents.mainFrame = { url: "integral-one://account/" };
          this.webContents.setWindowOpenHandler = () => {};
          this.webContents.send = (channel, payload) => {
            sent.push({ channel, payload });
          };
        }
        isDestroyed() {
          return false;
        }
        async loadURL() {}
        close() {
          this.emit("closed");
        }
      },
    },
  });
  const previous = process.env.INTEGRAL_HOME;
  process.env.INTEGRAL_HOME = home;
  t.after(() => {
    controller.cleanup();
    if (previous === undefined) delete process.env.INTEGRAL_HOME;
    else process.env.INTEGRAL_HOME = previous;
  });
  return {
    app,
    handlers,
    opened,
    schemes,
    controller,
    event: () => ({
      sender: win.webContents,
      senderFrame: win.webContents.mainFrame,
    }),
    close: () => win.emit("closed"),
    get windows() {
      return windows;
    },
    get protocol() {
      return protocol;
    },
    sent,
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("a browser action opens the pinned authorization URL and ignores renderer arguments", async (t) => {
  const f = fixture(t);
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: f.request,
  });
  void gate.controller.beforeBoot({ userData: f.home });
  assert.deepEqual(gate.schemes, ["integral-one"]);
  await gate.handlers.get("integral-one:account-start")(
    gate.event(),
    "not-a-token",
  );
  assert.equal(gate.opened.length, 1);
  const url = new URL(gate.opened[0]);
  assert.equal(url.origin + url.pathname, `${ISSUER}/auth`);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), APP_ID);
  assert.equal(url.searchParams.get("redirect_uri"), "integral-one://account/callback");
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]+$/);
  assert.match(url.searchParams.get("state"), /^[A-Za-z0-9_-]+$/);
  assert.match(url.searchParams.get("nonce"), /^[A-Za-z0-9_-]+$/);
  assert.notEqual(url.searchParams.get("state"), url.searchParams.get("nonce"));
  for (const name of ["client_secret", "resource", "organization", "offline_access"])
    assert.equal(url.searchParams.has(name), false);
  assert.equal(gate.opened[0].includes("not-a-token"), false);
});

test("an untrusted caller cannot start sign-in or complete setup", async (t) => {
  const f = fixture(t);
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: () => assert.fail("Untrusted sign-in contacted Logto"),
  });
  void gate.controller.beforeBoot({ userData: f.home });
  assert.equal(gate.handlers.has("integral-one:activate"), false);
  assert.equal(gate.handlers.has("integral-one:activation-import"), false);
  await assert.rejects(
    gate.handlers.get("integral-one:account-start")({
      sender: {},
      senderFrame: { url: "https://foreign.example" },
    }),
    /Untrusted/,
  );
  assert.equal(gate.opened.length, 0);
});

test("an unconfigured gate does not open the browser or the network", async (t) => {
  const f = fixture(t);
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: { ...publicConfig(), configured: false, appId: "" },
    request: async (url) => {
      calls.push(url);
      throw new Error("unconfigured gate contacted Logto");
    },
  });
  void gate.controller.beforeBoot({ userData: f.home });
  await assert.rejects(
    gate.handlers.get("integral-one:account-start")(gate.event()),
    /not configured/,
  );
  assert.equal(gate.opened.length, 0);
  assert.equal(calls.length, 0);
});

test("a matching callback writes version 3 and discards the tokens", async (t) => {
  const f = fixture(t);
  let idToken = "";
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url, options) => {
      calls.push({ url, options });
      if (url === TOKEN_URL)
        return new Response(
          JSON.stringify({
            id_token: idToken,
            access_token: ACCESS,
            refresh_token: REFRESH,
          }),
        );
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      throw new Error(`Unexpected account request ${url}`);
    },
  });
  const pending = gate.controller.beforeBoot({ userData: f.home });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  const auth = new URL(gate.opened[0]);
  idToken = token({ nonce: auth.searchParams.get("nonce") });
  let prevented = 0;
  gate.app.emit(
    "open-url",
    {
      preventDefault() {
        prevented += 1;
      },
    },
    "https://evil.example/callback",
  );
  gate.app.emit(
    "open-url",
    {
      preventDefault() {
        prevented += 1;
      },
    },
    callbackFrom(auth),
  );
  await pending;
  assert.equal(prevented, 1);
  assert.deepEqual(
    calls.map((call) => call.url),
    [TOKEN_URL, JWKS_URL],
  );
  const params = new URLSearchParams(calls[0].options.body);
  assert.equal(params.get("code"), CODE);
  assert.equal(params.get("client_id"), APP_ID);
  assert.equal(params.get("redirect_uri"), "integral-one://account/callback");
  assert.equal(params.get("client_secret"), null);
  assert.equal(
    crypto.createHash("sha256").update(params.get("code_verifier")).digest("base64url"),
    auth.searchParams.get("code_challenge"),
  );
  const stored = verifyLogtoSetup(f.home, readState(f.home));
  assert.equal(stored.v, 3);
  assert.equal(stored.sub, SUBJECT);
  assert.equal(stored.issuer, ISSUER);
  assert.equal(gate.controller.accountProfile().email, "owner@example.com");
  for (const name of ["activation.json", "setup-key.json"]) {
    const text = fs.readFileSync(accountPath(f.home, name), "utf8");
    for (const secret of [idToken, ACCESS, REFRESH, CODE, params.get("code_verifier")])
      assert.equal(text.includes(secret), false, name);
  }
  const response = await gate.protocol({
    url: `integral-one://account/callback?code=${CODE}&state=${auth.searchParams.get("state")}`,
  });
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not found");
});

for (const [label, change] of [
  ["a wrong state", (auth) => callbackFrom(auth, { state: "other-state" })],
  ["a missing code", (auth) => callbackFrom(auth, { includeCode: false })],
  ["an error parameter", (auth) => callbackFrom(auth, { error: "access_denied" })],
])
  test(`${label} does not call the token endpoint`, async (t) => {
    const f = fixture(t);
    const calls = [];
    const gate = openGate(t, {
      home: f.home,
      config: publicConfig(),
      request: async (url) => {
        calls.push(url);
        throw new Error("rejected callback contacted Logto");
      },
    });
    void gate.controller.beforeBoot({ userData: f.home });
    await gate.handlers.get("integral-one:account-start")(gate.event());
    const auth = new URL(gate.opened[0]);
    gate.app.emit("open-url", { preventDefault() {} }, change(auth));
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(readState(f.home).localSetup, undefined);
  });

test("a wrong state does not drop the outstanding attempt", async (t) => {
  const f = fixture(t);
  let idToken = "";
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      calls.push(url);
      if (url === TOKEN_URL)
        return new Response(JSON.stringify({ id_token: idToken, token_type: "Bearer" }));
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      throw new Error(url);
    },
  });
  const pending = gate.controller.beforeBoot({ userData: f.home });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  const auth = new URL(gate.opened[0]);
  gate.app.emit(
    "open-url",
    { preventDefault() {} },
    callbackFrom(auth, { state: "other-state" }),
  );
  await settle();
  assert.equal(calls.length, 0);
  idToken = token({ nonce: auth.searchParams.get("nonce") });
  gate.app.emit("open-url", { preventDefault() {} }, callbackFrom(auth));
  await pending;
  assert.equal(verifyLogtoSetup(f.home, readState(f.home)).sub, SUBJECT);
});

test("a reused attempt does not call the token endpoint", async (t) => {
  const f = fixture(t);
  let idToken = "";
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      calls.push(url);
      if (url === TOKEN_URL)
        return new Response(JSON.stringify({ id_token: idToken, token_type: "Bearer" }));
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      throw new Error(url);
    },
  });
  const pending = gate.controller.beforeBoot({ userData: f.home });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  const auth = new URL(gate.opened[0]);
  idToken = token({ nonce: auth.searchParams.get("nonce") });
  const callback = callbackFrom(auth);
  gate.app.emit("open-url", { preventDefault() {} }, callback);
  await pending;
  const tokenCalls = calls.filter((url) => url === TOKEN_URL).length;
  gate.app.emit("open-url", { preventDefault() {} }, callback);
  await settle();
  assert.equal(calls.filter((url) => url === TOKEN_URL).length, tokenCalls);
});

test("a callback with no outstanding attempt does not call the token endpoint", async (t) => {
  const f = fixture(t);
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      calls.push(url);
      throw new Error("idle callback contacted Logto");
    },
  });
  void gate.controller.beforeBoot({ userData: f.home });
  gate.app.emit(
    "open-url",
    { preventDefault() {} },
    "integral-one://account/callback?code=sentinel-auth-code&state=none",
  );
  gate.app.emit(
    "second-instance",
    {},
    [process.execPath, "integral-one://account/callback?code=sentinel-auth-code&state=none"],
  );
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(readState(f.home).localSetup, undefined);
});

test("a launch command line callback does not call the token endpoint", async (t) => {
  const f = fixture(t);
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      calls.push(url);
      throw new Error("launch callback contacted Logto");
    },
  });
  const argv = process.argv.slice();
  process.argv = [
    ...argv,
    "integral-one://account/callback?code=sentinel-auth-code&state=launch",
  ];
  t.after(() => {
    process.argv = argv;
  });
  void gate.controller.beforeBoot({ userData: f.home });
  await settle();
  assert.equal(calls.length, 0);
});

test("a second-instance callback completes the outstanding attempt", async (t) => {
  const f = fixture(t);
  let idToken = "";
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      if (url === TOKEN_URL)
        return new Response(JSON.stringify({ id_token: idToken, token_type: "Bearer" }));
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      throw new Error(url);
    },
  });
  const pending = gate.controller.beforeBoot({ userData: f.home });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  const auth = new URL(gate.opened[0]);
  idToken = token({ nonce: auth.searchParams.get("nonce") });
  gate.app.emit("second-instance", {}, [process.execPath, callbackFrom(auth)]);
  await pending;
  assert.equal(verifyLogtoSetup(f.home, readState(f.home)).sub, SUBJECT);
});

test("a valid version 3 record opens the workspace with no network call", async (t) => {
  const f = fixture(t);
  f.issue();
  await f.exchange();
  const handlers = new Map();
  const calls = [];
  const controller = createController({
    config: publicConfig(),
    request: async () => {
      calls.push("network");
      throw new Error("offline boot contacted Logto");
    },
    electron: {
      app: new EventEmitter(),
      session: {
        fromPartition: () =>
          assert.fail("Offline access must not create an account session"),
      },
      ipcMain: {
        handle: (name, fn) => handlers.set(name, fn),
        removeHandler: (name) => handlers.delete(name),
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
  assert.equal(calls.length, 0);
  assert.equal(controller.accountProfile().email, "owner@example.com");
  controller.signOut();
  assert.equal(readState(f.home).signedOut, true);
  assert.equal(readState(f.home).localSetup !== undefined, true);
  assert.throws(() => controller.authorizeSession(), /Sign in/);
  controller.resumeOffline();
  assert.equal(readState(f.home).signedOut, false);
  controller.authorizeSession();
  assert.equal(calls.length, 0);
  assert.equal(readState(f.home).installationId, f.state.installationId);
  controller.cleanup();
  assert.equal(handlers.size, 0);
});

test("restart sign-in drops the outstanding attempt", async (t) => {
  const f = fixture(t);
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      calls.push(url);
      throw new Error("dropped callback contacted Logto");
    },
  });
  void gate.controller.beforeBoot({ userData: f.home });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  const first = new URL(gate.opened[0]);
  await gate.handlers.get("integral-one:account-restart")(gate.event());
  const second = new URL(gate.opened[1]);
  assert.notEqual(first.searchParams.get("state"), second.searchParams.get("state"));
  assert.equal(first.searchParams.get("prompt"), null);
  assert.equal(second.searchParams.get("prompt"), "login");
  gate.app.emit("open-url", { preventDefault() {} }, callbackFrom(first));
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(readState(f.home).localSetup, undefined);
});

test("closing a later sign-in leaves local data unchanged", async (t) => {
  const f = fixture(t);
  f.issue();
  await f.exchange();
  const original = fs.readFileSync(accountPath(f.home, "activation.json"));
  const key = fs.readFileSync(accountPath(f.home, "setup-key.json"));
  const calls = [];
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async () => {
      calls.push("network");
      throw new Error("cancelled sign-in contacted Logto");
    },
  });
  const pending = gate.controller.beforeBoot({
    userData: f.home,
    forceSignIn: true,
  });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  const auth = new URL(gate.opened[0]);
  gate.close();
  await assert.rejects(pending, /local data is unchanged/);
  gate.app.emit("open-url", { preventDefault() {} }, callbackFrom(auth));
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json")).equals(original),
    true,
  );
  assert.equal(
    fs.readFileSync(accountPath(f.home, "setup-key.json")).equals(key),
    true,
  );
});

test("a different Logto subject does not replace the linked setup", async (t) => {
  const f = fixture(t);
  let idToken = "";
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      if (url === TOKEN_URL)
        return new Response(JSON.stringify({ id_token: idToken, token_type: "Bearer" }));
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      throw new Error(url);
    },
  });
  const pending = gate.controller.beforeBoot({ userData: f.home });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  let auth = new URL(gate.opened[0]);
  idToken = token({ nonce: auth.searchParams.get("nonce") });
  gate.app.emit("open-url", { preventDefault() {} }, callbackFrom(auth));
  await pending;
  const original = fs.readFileSync(accountPath(f.home, "activation.json"));
  const key = fs.readFileSync(accountPath(f.home, "setup-key.json"));
  const again = gate.controller.beforeBoot({
    userData: f.home,
    forceSignIn: true,
  });
  await gate.handlers.get("integral-one:account-start")(gate.event());
  auth = new URL(gate.opened[1]);
  idToken = token({ nonce: auth.searchParams.get("nonce") }, { sub: "other-subject" });
  gate.app.emit("open-url", { preventDefault() {} }, callbackFrom(auth, { code: "other-code" }));
  await settle();
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json")).equals(original),
    true,
  );
  assert.equal(
    fs.readFileSync(accountPath(f.home, "setup-key.json")).equals(key),
    true,
  );
  gate.close();
  await assert.rejects(again, /local data is unchanged/);
});

const LINKED_ACCOUNT =
  "Sign in with the account linked to this computer. Your local data is unchanged.";

function installAccountDocument() {
  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const ELEMENT = 1;
  const TEXT = 3;
  const DOCUMENT = 9;
  class Node {
    constructor(nodeType, nodeName) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.parentNode = null;
      this.childNodes = [];
      this.ownerDocument = null;
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const index = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[index + 1] || null;
    }
    get previousSibling() {
      if (!this.parentNode) return null;
      const index = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[index - 1] || null;
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(child, before) {
      if (!before) return this.appendChild(child);
      if (child.parentNode) child.parentNode.removeChild(child);
      const index = this.childNodes.indexOf(before);
      if (index < 0) throw new Error("insertBefore missing reference");
      child.parentNode = this;
      this.childNodes.splice(index, 0, child);
      return child;
    }
    removeChild(child) {
      const index = this.childNodes.indexOf(child);
      if (index < 0) throw new Error("removeChild missing node");
      this.childNodes.splice(index, 1);
      child.parentNode = null;
      return child;
    }
    get textContent() {
      if (this.nodeType === TEXT) return this.nodeValue || "";
      return this.childNodes.map((child) => child.textContent).join("");
    }
    set textContent(value) {
      for (const child of this.childNodes.slice()) this.removeChild(child);
      if (value != null && value !== "")
        this.appendChild(this.ownerDocument.createTextNode(String(value)));
    }
  }
  class Element extends Node {
    constructor(tag, owner) {
      super(ELEMENT, String(tag).toUpperCase());
      this.ownerDocument = owner;
      this.tagName = String(tag).toUpperCase();
      this.namespaceURI = HTML_NS;
      this.attributes = new Map();
      this.style = {
        setProperty(name, value) {
          this[name] = value;
        },
      };
      this.onclick = null;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    setAttributeNS(_namespace, name, value) {
      this.setAttribute(name, value);
    }
    addEventListener() {}
    removeEventListener() {}
    get id() {
      return this.getAttribute("id") || "";
    }
    set id(value) {
      this.setAttribute("id", value);
    }
  }
  class TextNode extends Node {
    constructor(value, owner) {
      super(TEXT, "#text");
      this.ownerDocument = owner;
      this.nodeValue = String(value);
    }
  }
  class DocumentNode extends Node {
    constructor() {
      super(DOCUMENT, "#document");
      this.ownerDocument = this;
      this.documentElement = new Element("html", this);
      this.appendChild(this.documentElement);
      this.body = new Element("body", this);
      this.documentElement.appendChild(this.body);
      this.defaultView = null;
    }
    createElement(tag) {
      return new Element(tag, this);
    }
    createElementNS(_namespace, tag) {
      return this.createElement(tag);
    }
    createTextNode(value) {
      return new TextNode(value, this);
    }
    getElementById(id) {
      const walk = (node) => {
        if (node.nodeType === ELEMENT && node.getAttribute("id") === id) return node;
        for (const child of node.childNodes) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(this);
    }
    addEventListener() {}
    removeEventListener() {}
  }
  const document = new DocumentNode();
  const window = {
    document,
    HTMLElement: Element,
    Element,
    Node,
    HTMLIFrameElement: class HTMLIFrameElement {},
    addEventListener() {},
    removeEventListener() {},
    navigator: { userAgent: "node" },
    getComputedStyle() {
      return {};
    },
  };
  document.defaultView = window;
  const mount = document.createElement("div");
  mount.id = "root";
  document.body.appendChild(mount);
  return { document, window, Element, Node };
}

function alertText(root) {
  const found = [];
  const walk = (node) => {
    if (node.nodeType === 1 && node.getAttribute("role") === "alert")
      found.push(node.textContent);
    for (const child of node.childNodes || []) walk(child);
  };
  walk(root);
  return found.join("\n");
}

async function renderAccountPage(t, gate) {
  const esbuild = require("esbuild");
  const Module = require("node:module");
  const installed = installAccountDocument();
  const previous = {
    window: global.window,
    document: global.document,
    HTMLElement: global.HTMLElement,
    Element: global.Element,
    Node: global.Node,
    IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT,
  };
  global.window = installed.window;
  global.document = installed.document;
  global.HTMLElement = installed.Element;
  global.Element = installed.Element;
  global.Node = installed.Node;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const listeners = new Map();
  const electron = {
    contextBridge: {
      exposeInMainWorld(name, api) {
        global.window[name] = api;
      },
    },
    ipcRenderer: {
      invoke(channel, ...args) {
        const handler = gate.handlers.get(channel);
        if (!handler) return Promise.reject(new Error(channel));
        return Promise.resolve(handler(gate.event(), ...args));
      },
      on(channel, listener) {
        const set = listeners.get(channel) || new Set();
        set.add(listener);
        listeners.set(channel, set);
      },
      removeListener(channel, listener) {
        listeners.get(channel)?.delete(listener);
      },
    },
  };
  const originalRequire = Module.prototype.require;
  const preload = path.join(__dirname, "../desktop/accounts/preload-entry.js");
  Module.prototype.require = function (request) {
    if (request === "electron") return electron;
    return originalRequire.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(preload)];
    require(preload);
  } finally {
    Module.prototype.require = originalRequire;
  }
  const built = esbuild.buildSync({
    entryPoints: [path.join(__dirname, "../accounts/renderer.jsx")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    external: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    jsx: "automatic",
  });
  const { act } = require("react");
  const runner = new Function(
    "require",
    "module",
    "exports",
    built.outputFiles[0].text,
  );
  await act(async () => {
    const module = { exports: {} };
    runner(require, module, module.exports);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  t.after(() => {
    delete require.cache[require.resolve(preload)];
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete global[key];
      else global[key] = previous[key];
    }
  });
  const root = installed.document.getElementById("root");
  return {
    text: () => root.textContent,
    alertText: () => alertText(root),
    async deliver(messages) {
      await act(async () => {
        for (const message of messages)
          for (const listener of listeners.get(message.channel) || [])
            listener({}, message.payload);
      });
    },
  };
}

test("a different subject reaches the account page as the linked account", async (t) => {
  const f = fixture(t);
  f.issue();
  await f.exchange();
  let idToken = "";
  const gate = openGate(t, {
    home: f.home,
    config: publicConfig(),
    request: async (url) => {
      if (url === TOKEN_URL)
        return new Response(JSON.stringify({ id_token: idToken, token_type: "Bearer" }));
      if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      throw new Error(url);
    },
  });
  const pending = gate.controller.beforeBoot({
    userData: f.home,
    forceSignIn: true,
  });
  const page = await renderAccountPage(t, gate);
  assert.match(page.text(), /Continue in your browser/);
  assert.equal(page.alertText().includes(LINKED_ACCOUNT), false);
  const original = fs.readFileSync(accountPath(f.home, "activation.json"));
  const key = fs.readFileSync(accountPath(f.home, "setup-key.json"));
  await gate.handlers.get("integral-one:account-start")(gate.event());
  const auth = new URL(gate.opened[0]);
  idToken = token({ nonce: auth.searchParams.get("nonce") }, { sub: "other-subject" });
  gate.app.emit(
    "open-url",
    { preventDefault() {} },
    callbackFrom(auth, { code: "other-code" }),
  );
  await settle();
  await page.deliver(gate.sent);
  assert.equal(
    fs.readFileSync(accountPath(f.home, "activation.json")).equals(original),
    true,
  );
  assert.equal(
    fs.readFileSync(accountPath(f.home, "setup-key.json")).equals(key),
    true,
  );
  assert.equal(readState(f.home).installationId, f.state.installationId);
  assert.equal(page.alertText().trim(), LINKED_ACCOUNT);
  gate.close();
  await assert.rejects(pending, /local data is unchanged/);
});

test("desktop main constructs the account controller without the Clerk bridge", () => {
  const main = fs.readFileSync(
    path.join(__dirname, "../desktop/main.js"),
    "utf8",
  );
  assert.match(main, /createController\(\{/);
  assert.doesNotMatch(main, /createClerkBridge/);
  assert.doesNotMatch(main, /@clerk\/electron/);
});

test("the account package no longer depends on @clerk/electron", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package-lock.json"), "utf8"),
  );
  assert.equal(Object.hasOwn(pkg.dependencies, "@clerk/electron"), false);
  assert.equal(
    Object.hasOwn(lock.packages[""].dependencies, "@clerk/electron"),
    false,
  );
  assert.equal(lock.packages["node_modules/@clerk/electron"], undefined);
  assert.deepEqual(pkg.build.protocols[0].schemes, ["integral-one"]);
  assert.equal(
    fs.existsSync(path.join(__dirname, "../desktop/accounts/clerk-setup.js")),
    true,
  );
  assert.equal(fs.existsSync(path.join(__dirname, "clerk-sdk.test.js")), false);
  assert.throws(() => require.resolve("@clerk/electron"));
});

test("desktop main registers integral-one as a privileged standard scheme", () => {
  const main = fs.readFileSync(
    path.join(__dirname, "../desktop/main.js"),
    "utf8",
  );
  assert.match(main, /registerSchemesAsPrivileged/);
  assert.match(main, /scheme:\s*["']integral-one["']/);
  assert.match(main, /standard:\s*true/);
  assert.match(main, /secure:\s*true/);
  assert.match(main, /supportFetchAPI:\s*true/);
});


test('OAuth error callbacks require the pending state and never forward remote error descriptions', async t => {
  const f = fixture(t), gate = openGate(t, { home: f.home, config: publicConfig(), request: async () => assert.fail('Error callback must not exchange a token') });
  void gate.controller.beforeBoot({ userData: f.home });
  await gate.handlers.get('integral-one:account-start')(gate.event());
  const auth = new URL(gate.opened[0]);
  const url = new URL(callbackFrom(auth, { state: 'wrong', error: 'access_denied' }));
  url.searchParams.set('error_description', 'sentinel-private-remote-body');
  gate.app.emit('open-url', { preventDefault() {} }, url.href); await settle();
  assert.equal(gate.sent.length, 0);
  url.searchParams.set('state', auth.searchParams.get('state'));
  gate.app.emit('open-url', { preventDefault() {} }, url.href); await settle();
  assert.equal(gate.sent.length, 1); assert.doesNotMatch(JSON.stringify(gate.sent), /sentinel-private/);
});
