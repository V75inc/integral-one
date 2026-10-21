"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { ID, privateFile, readState, verifyReceipt } = require("./receipt");
const ORIGIN = "integral-one://account";
const CLAIMS = {
  integral_one_email: "{{user.primary_email_address}}",
  integral_one_email_verified: "{{user.email_verified}}",
  integral_one_name: "{{user.full_name}}",
};
function decode(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error("Invalid sign-in proof.");
  const bytes = Buffer.from(part, "base64url");
  if (bytes.toString("base64url") !== part)
    throw new Error("Invalid sign-in proof.");
  return JSON.parse(bytes.toString("utf8"));
}
async function readJwks(response) {
  if (!response.ok)
    throw new Error("Could not verify sign-in. Try again online.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 65536) throw new Error("Invalid account signing keys.");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel();
  }
}
async function verifyClerkSession(
  token,
  config,
  request = fetch,
  now = Date.now(),
) {
  if (typeof token !== "string" || token.length > 16000)
    throw new Error("Invalid sign-in proof.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid sign-in proof.");
  const header = decode(parts[0]),
    claims = decode(parts[1]);
  if (
    header.alg !== "RS256" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid || "") ||
    header.crit ||
    header.jku ||
    header.x5u
  )
    throw new Error("Unsupported account signature.");
  const seconds = now / 1000;
  if (
    claims.iss !== config.clerkIssuer ||
    claims.azp !== ORIGIN ||
    !/^user_[A-Za-z0-9]+$/.test(claims.sub || "") ||
    !/^sess_[A-Za-z0-9]+$/.test(claims.sid || "") ||
    claims.v !== 2 ||
    (claims.sts !== undefined && claims.sts !== "active") ||
    claims.act ||
    ![claims.iat, claims.nbf, claims.exp].every(Number.isFinite) ||
    claims.iat > seconds + 5 ||
    claims.nbf > seconds + 5 ||
    claims.exp <= seconds ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 300 ||
    seconds - claims.iat > 300
  )
    throw new Error(
      "Sign-in proof is expired, incomplete or from another application.",
    );
  if (
    claims.integral_one_email_verified !== true ||
    typeof claims.integral_one_email !== "string" ||
    claims.integral_one_email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(claims.integral_one_email) ||
    (claims.integral_one_name !== null &&
      claims.integral_one_name !== undefined &&
      (typeof claims.integral_one_name !== "string" ||
        claims.integral_one_name.length > 256))
  )
    throw new Error(
      "A verified email and the Integral One session claims are required.",
    );
  // Never use a token-supplied URL or send the token with this public-key request.
  const jwks = await readJwks(
    await request(`${config.clerkIssuer}/.well-known/jwks.json`, {
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(10000),
    }),
  );
  if (!Array.isArray(jwks.keys) || jwks.keys.length > 20)
    throw new Error("Invalid account signing keys.");
  const matches = jwks.keys.filter(
    (key) =>
      key.kid === header.kid &&
      key.kty === "RSA" &&
      (!key.use || key.use === "sig") &&
      (!key.alg || key.alg === "RS256") &&
      !key.d &&
      (!key.key_ops ||
        (Array.isArray(key.key_ops) && key.key_ops.includes("verify"))),
  );
  if (matches.length !== 1) throw new Error("Unknown account signing key.");
  const key = crypto.createPublicKey({ key: matches[0], format: "jwk" });
  if (
    key.asymmetricKeyDetails.modulusLength < 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[2]) ||
    !crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    )
  )
    throw new Error("Invalid account signature.");
  return {
    sub: claims.sub,
    clerk_issuer: claims.iss,
    profile: {
      email: claims.integral_one_email,
      name: claims.integral_one_name || "",
    },
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
function verifyLocalSetup(home, state, config) {
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
    payload.v !== 2 ||
    payload.product !== "integral-one" ||
    !ID.test(state.installationId) ||
    payload.installation_id !== state.installationId ||
    payload.clerk_issuer !== config.clerkIssuer ||
    !/^user_[A-Za-z0-9]+$/.test(payload.sub || "") ||
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
function verifyAccount(home, state, config) {
  if (state.localSetup) return verifyLocalSetup(home, state, config);
  if (state.receipt)
    return verifyReceipt(state.receipt, {
      ...config,
      installationId: state.installationId,
    });
  throw new Error("Sign up on this computer first.");
}
async function saveClerkSetup(home, state, token, config, request = fetch) {
  const identity = await verifyClerkSession(token, config, request);
  // Re-read after network verification: never overwrite a concurrent binding or
  // corrupt state using the pre-request snapshot supplied by the controller.
  const prior = readState(home);
  if (!prior || prior.installationId !== state.installationId)
    throw new Error("Local setup changed. Restart sign-in.");
  if (prior.receipt || prior.localSetup) {
    const original = verifyAccount(home, prior, config);
    if (
      original.sub !== identity.sub ||
      original.clerk_issuer !== identity.clerk_issuer
    )
      throw new Error(
        "Sign in with the account linked to this computer. Your local data is unchanged.",
      );
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
      v: 2,
      product: "integral-one",
      installation_id: prior.installationId,
      completed_at: new Date().toISOString(),
      ...identity,
    }),
  ).toString("base64url");
  // This local key is an integrity check, not a remote credential or an OS-user
  // security boundary. No Clerk token, secret or recurring expiry is persisted.
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
  CLAIMS,
  verifyClerkSession,
  verifyLocalSetup,
  verifyAccount,
  saveClerkSetup,
};
