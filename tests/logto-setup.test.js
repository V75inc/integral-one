"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateConfig } = require("../desktop/accounts/config");
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
    ["unverified email", { email_verified: false }, {}],
    ["string email_verified", { email_verified: "true" }, {}],
    ["email without one @", { email: "owner.example.com" }, {}],
    ["missing name", { name: undefined }, {}],
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
