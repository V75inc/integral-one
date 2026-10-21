"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const AUDIENCE = "integral-one-local-activation";
const ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function decode(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part))
    throw new Error("Invalid activation code.");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}
function verifyReceipt(
  code,
  { installationId, issuer, clerkIssuer, publicKeys },
) {
  if (typeof code !== "string" || code.length > 12000)
    throw new Error("Invalid activation code.");
  const parts = code.trim().split(".");
  if (parts.length !== 3) throw new Error("Invalid activation code.");
  const [head, body, signature] = parts;
  const header = decode(head),
    payload = decode(body);
  if (
    header.alg !== "EdDSA" ||
    header.typ !== "integral-one-activation+jwt" ||
    !Object.hasOwn(publicKeys, header.kid)
  )
    throw new Error("Unknown activation signing key.");
  const key = crypto.createPublicKey(publicKeys[header.kid]);
  if (
    key.asymmetricKeyType !== "ed25519" ||
    !/^[A-Za-z0-9_-]+$/.test(signature) ||
    !crypto.verify(
      null,
      Buffer.from(`${head}.${body}`),
      key,
      Buffer.from(signature, "base64url"),
    )
  )
    throw new Error("Activation signature is invalid.");
  if (
    payload.v !== 1 ||
    payload.aud !== AUDIENCE ||
    payload.product !== "integral-one" ||
    payload.iss !== issuer ||
    payload.clerk_issuer !== clerkIssuer ||
    !/^user_[A-Za-z0-9]+$/.test(payload.sub || "") ||
    !ID.test(installationId) ||
    payload.installation_id !== installationId ||
    typeof payload.activated_at !== "string" ||
    !Number.isFinite(Date.parse(payload.activated_at)) ||
    Object.hasOwn(payload, "exp")
  )
    throw new Error(
      "Activation is not valid for this installation/account service.",
    );
  if (
    payload.profile &&
    (typeof payload.profile.email !== "string" ||
      payload.profile.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+$/.test(payload.profile.email) ||
      typeof payload.profile.name !== "string" ||
      payload.profile.name.length > 256)
  )
    throw new Error("Invalid signed account profile.");
  // Deliberately no online lookup, session expiry or recurring clock check. This is
  // a durable local activation receipt, never a Business/API authorization token.
  return payload;
}
function lstat(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function privateFile(file, value) {
  const parent = path.dirname(file);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(parent).isSymbolicLink() || lstat(file)?.isSymbolicLink())
    throw new Error("Activation state must not be a symlink.");
  const temp = path.join(parent, `.activation-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(value) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function readState(home) {
  const file = path.join(home, "one-account", "activation.json");
  if (
    lstat(path.dirname(file))?.isSymbolicLink() ||
    lstat(file)?.isSymbolicLink()
  )
    throw new Error("Activation state needs recovery.");
  if (!lstat(file)) return null;
  if (
    fs.lstatSync(path.dirname(file)).isSymbolicLink() ||
    fs.lstatSync(file).isSymbolicLink()
  )
    throw new Error("Activation state needs recovery.");
  if (fs.statSync(file).size > 16000)
    throw new Error("Activation state needs recovery.");
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!ID.test(state.installationId))
    throw new Error("Activation identity needs recovery.");
  return state;
}
function loadState(home) {
  const current = readState(home);
  if (current) return current;
  const state = { installationId: crypto.randomUUID() };
  privateFile(path.join(home, "one-account", "activation.json"), state);
  return state;
}
function saveReceipt(home, state, code, config) {
  const receipt = verifyReceipt(code, {
    ...config,
    installationId: state.installationId,
  });
  const prior = readState(home);
  if (prior?.localSetup)
    throw new Error(
      "Use sign-in with the account linked to this computer. Your local data is unchanged.",
    );
  if (prior?.receipt) {
    const original = verifyReceipt(prior.receipt, {
      ...config,
      installationId: state.installationId,
    });
    if (
      original.sub !== receipt.sub ||
      original.clerk_issuer !== receipt.clerk_issuer
    )
      throw new Error(
        "Sign in with the account linked to this computer. Your local data is unchanged.",
      );
  }
  privateFile(path.join(home, "one-account", "activation.json"), {
    ...state,
    signedOut: false,
    receipt: code.trim(),
  });
  return receipt;
}
module.exports = {
  AUDIENCE,
  ID,
  verifyReceipt,
  privateFile,
  readState,
  loadState,
  saveReceipt,
};
