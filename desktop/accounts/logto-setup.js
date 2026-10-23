"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { ID, privateFile, readState } = require("./receipt");
const ISSUER = "https://auth.saas.apps.trueselph.com/oidc";
const PATHS = { auth: "/auth", token: "/token", jwks: "/jwks" };
const REDIRECT_URI = "integral-one://account/callback";
const BODY_LIMIT = 65536;
function endpoint(name) {
  return ISSUER + PATHS[name];
}
function createAttempt() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url"),
    state: crypto.randomBytes(32).toString("base64url"),
    nonce: crypto.randomBytes(32).toString("base64url"),
  };
}
function authorizationUrl(appId, attempt) {
  const url = new URL(endpoint("auth"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", attempt.challenge);
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("nonce", attempt.nonce);
  return url.toString();
}
function decode(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error("Invalid sign-in proof.");
  const bytes = Buffer.from(part, "base64url");
  if (bytes.toString("base64url") !== part)
    throw new Error("Invalid sign-in proof.");
  return JSON.parse(bytes.toString("utf8"));
}
async function readCapped(response) {
  if (!response || response.redirected || !response.ok)
    throw new Error("Could not verify sign-in. Try again online.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > BODY_LIMIT) throw new Error("Invalid account signing keys.");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel();
  }
}
function linkedAccount() {
  throw new Error(
    "Sign in with the account linked to this computer. Your local data is unchanged.",
  );
}
function verifyClaims(claims, appId, nonce, now) {
  const seconds = now / 1000;
  if (
    claims.iss !== ISSUER ||
    claims.aud !== appId ||
    typeof claims.sub !== "string" ||
    claims.sub.length < 1 ||
    claims.sub.length > 128 ||
    claims.nonce !== nonce ||
    !Number.isFinite(claims.iat) ||
    !Number.isFinite(claims.exp) ||
    claims.iat > seconds + 5 ||
    seconds - claims.iat > 300 ||
    (Object.hasOwn(claims, "nbf") &&
      (!Number.isFinite(claims.nbf) || claims.nbf > seconds + 5)) ||
    claims.exp <= seconds ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 3600
  )
    throw new Error(
      "Sign-in proof is expired, incomplete or from another application.",
    );
  if (
    claims.email_verified !== true ||
    typeof claims.email !== "string" ||
    claims.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(claims.email) ||
    typeof claims.name !== "string" ||
    claims.name.length > 256
  )
    throw new Error("A verified email and name are required.");
}
function signingJwk(keys, kid) {
  if (!Array.isArray(keys)) throw new Error("Invalid account signing keys.");
  const matches = keys.filter((key) => key && key.kid === kid);
  if (matches.length !== 1) throw new Error("Unknown account signing key.");
  const jwk = matches[0];
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-384" ||
    Object.hasOwn(jwk, "d") ||
    (jwk.use && jwk.use !== "sig") ||
    (jwk.alg && jwk.alg !== "ES384") ||
    (jwk.key_ops &&
      !(Array.isArray(jwk.key_ops) && jwk.key_ops.includes("verify")))
  )
    throw new Error("Unknown account signing key.");
  return jwk;
}
async function verifyLogtoToken(proof, request, now) {
  const { code, attempt, appId } = proof || {};
  if (
    typeof code !== "string" ||
    code.length < 1 ||
    code.length > 2048 ||
    typeof appId !== "string" ||
    appId.length < 1 ||
    appId.length > 200 ||
    typeof attempt?.verifier !== "string" ||
    typeof attempt?.nonce !== "string"
  )
    throw new Error("Invalid sign-in proof.");
  const tokenBody = JSON.parse(
    await readCapped(
      await request(endpoint("token"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: attempt.verifier,
          client_id: appId,
          redirect_uri: REDIRECT_URI,
        }).toString(),
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
      }),
    ),
  );
  if (typeof tokenBody.id_token !== "string" || tokenBody.id_token.length > 16000)
    throw new Error("Invalid sign-in proof.");
  const parts = tokenBody.id_token.split(".");
  if (parts.length !== 3) throw new Error("Invalid sign-in proof.");
  const header = decode(parts[0]),
    claims = decode(parts[1]);
  if (
    header.alg !== "ES384" ||
    typeof header.kid !== "string" ||
    header.kid.length < 1 ||
    header.kid.length > 128 ||
    Object.hasOwn(header, "jku") ||
    Object.hasOwn(header, "x5u") ||
    Object.hasOwn(header, "crit")
  )
    throw new Error("Unsupported account signature.");
  verifyClaims(claims, appId, attempt.nonce, now);
  // Never use a token-supplied URL. ES384 is raw R||S, so Node must not use its DER default.
  const jwks = JSON.parse(
    await readCapped(
      await request(endpoint("jwks"), {
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
      }),
    ),
  );
  const key = crypto.createPublicKey({
    key: signingJwk(jwks.keys, header.kid),
    format: "jwk",
  });
  let valid = false;
  try {
    valid =
      key.asymmetricKeyType === "ec" &&
      key.asymmetricKeyDetails.namedCurve === "secp384r1" &&
      /^[A-Za-z0-9_-]+$/.test(parts[2]) &&
      crypto.verify(
        "sha384",
        Buffer.from(`${parts[0]}.${parts[1]}`),
        { key, dsaEncoding: "ieee-p1363" },
        Buffer.from(parts[2], "base64url"),
      );
  } catch {
    valid = false;
  }
  if (!valid) throw new Error("Invalid account signature.");
  return {
    sub: claims.sub,
    issuer: claims.iss,
    profile: { email: claims.email, name: claims.name },
  };
}
function keyFile(home) {
  return path.join(home, "one-account", "setup-key.json");
}
function readKey(home) {
  const file = keyFile(home);
  if (
    fs.lstatSync(path.dirname(file)).isSymbolicLink() ||
    fs.lstatSync(file).isSymbolicLink() ||
    fs.statSync(file).size > 4096
  )
    throw new Error("Local setup key needs recovery.");
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  const key = crypto.createPrivateKey(stored.privateKey);
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("Invalid local setup key.");
  return key;
}
function verifyLogtoSetup(home, state) {
  const setup = state.localSetup;
  if (
    !setup ||
    typeof setup.payload !== "string" ||
    setup.payload.length > 4096 ||
    !/^[A-Za-z0-9_-]{86}$/.test(setup.signature || "")
  )
    throw new Error("Local setup record needs recovery.");
  const payload = decode(setup.payload);
  if (
    !crypto.verify(
      null,
      Buffer.from(setup.payload),
      crypto.createPublicKey(readKey(home)),
      Buffer.from(setup.signature, "base64url"),
    ) ||
    payload.v !== 3 ||
    payload.product !== "integral-one" ||
    !ID.test(state.installationId) ||
    payload.installation_id !== state.installationId ||
    payload.issuer !== ISSUER ||
    typeof payload.sub !== "string" ||
    payload.sub.length < 1 ||
    payload.sub.length > 128 ||
    typeof payload.completed_at !== "string" ||
    !Number.isFinite(Date.parse(payload.completed_at)) ||
    Object.hasOwn(payload, "exp") ||
    typeof payload.profile?.email !== "string" ||
    payload.profile.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(payload.profile.email) ||
    typeof payload.profile.name !== "string" ||
    payload.profile.name.length > 256
  )
    throw new Error("Local setup record needs recovery.");
  return payload;
}
async function saveLogtoSetup(
  home,
  state,
  proof,
  request = fetch,
  now = Date.now(),
) {
  const identity = await verifyLogtoToken(proof, request, now);
  // Re-read after the exchange so a concurrent completion cannot be replaced.
  const prior = readState(home);
  if (!prior || prior.installationId !== state.installationId)
    throw new Error("Local setup changed. Restart sign-in.");
  if (prior.receipt) linkedAccount();
  if (prior.localSetup) {
    const original = verifyLogtoSetup(home, prior);
    if (original.sub !== identity.sub || original.issuer !== identity.issuer)
      linkedAccount();
  }
  let key;
  if (fs.existsSync(keyFile(home))) key = readKey(home);
  else {
    if (prior.localSetup) throw new Error("Local setup key needs recovery.");
    key = crypto.generateKeyPairSync("ed25519").privateKey;
    privateFile(keyFile(home), {
      privateKey: key.export({ format: "pem", type: "pkcs8" }),
    });
  }
  const payload = Buffer.from(
    JSON.stringify({
      v: 3,
      product: "integral-one",
      installation_id: prior.installationId,
      issuer: identity.issuer,
      sub: identity.sub,
      completed_at: new Date().toISOString(),
      profile: identity.profile,
    }),
  ).toString("base64url");
  // The local key is an integrity check. No Logto token, code, or verifier is stored.
  privateFile(path.join(home, "one-account", "activation.json"), {
    ...prior,
    signedOut: false,
    localSetup: {
      payload,
      signature: crypto
        .sign(null, Buffer.from(payload), key)
        .toString("base64url"),
    },
  });
  return identity;
}
module.exports = {
  ISSUER,
  createAttempt,
  authorizationUrl,
  verifyLogtoSetup,
  saveLogtoSetup,
};
