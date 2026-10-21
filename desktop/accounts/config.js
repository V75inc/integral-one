"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
function validateConfig(config) {
  const fields = new Set([
    "contractVersion",
    "provider",
    "configured",
    "environment",
    "publishableKey",
    "clerkIssuer",
    "activationUrl",
    "publicKeys",
    "issuer",
    "setupMode",
  ]);
  if (!config || Object.keys(config).some((name) => !fields.has(name)))
    throw new Error("Only public account configuration fields are accepted.");
  if (config.provider !== "clerk" || ![1, 2].includes(config.contractVersion))
    throw new Error("Unsupported Integral Account configuration.");
  if (config.contractVersion === 2 && config.setupMode !== "clerk")
    throw new Error("Account configuration v2 requires Clerk-only setup.");
  if (config.contractVersion === 1 && config.setupMode !== undefined)
    throw new Error("Clerk-only setup requires account configuration v2.");
  if (typeof config.configured !== "boolean")
    throw new Error(
      "Account configuration must explicitly state whether it is configured.",
    );
  if (!config.configured) return config;
  config = { ...config, environment: config.environment || "production" };
  if (!["production", "development"].includes(config.environment))
    throw new Error("Unsupported account environment.");
  if (!/^pk_(test|live)_[A-Za-z0-9_+/=-]+$/.test(config.publishableKey || ""))
    throw new Error("A Clerk publishable key is required.");
  const host = Buffer.from(
    config.publishableKey.replace(/^pk_(test|live)_/, ""),
    "base64",
  )
    .toString("utf8")
    .replace(/\$$/, "");
  const clerk = new URL(config.clerkIssuer);
  if (
    clerk.protocol !== "https:" ||
    clerk.origin !== config.clerkIssuer ||
    clerk.hostname !== host ||
    clerk.username ||
    clerk.password
  )
    throw new Error(
      "The Clerk issuer must be the exact HTTPS origin matching its key.",
    );
  if (
    config.environment === "production" &&
    !config.publishableKey.startsWith("pk_live_")
  )
    throw new Error("Production builds require a production Clerk instance.");
  // Legacy keys remain optional in Clerk-only builds, but must be retained when
  // upgrading installations that already hold service-signed receipts.
  if (config.contractVersion === 2 && !config.activationUrl) {
    if (config.issuer || Object.keys(config.publicKeys || {}).length)
      throw new Error(
        "Legacy receipt keys require their original service origin.",
      );
    return { ...config, publicKeys: {} };
  }
  const service = new URL(config.activationUrl);
  const testLoopback =
    config.environment === "development" &&
    config.publishableKey.startsWith("pk_test_") &&
    service.protocol === "http:" &&
    service.hostname === "127.0.0.1";
  if (
    (service.protocol !== "https:" && !testLoopback) ||
    service.origin !== config.activationUrl ||
    service.username ||
    service.password
  )
    throw new Error(
      "Account origins must be exact HTTPS origins and match the Clerk key.",
    );
  if (!config.publicKeys || !Object.keys(config.publicKeys).length)
    throw new Error("Pin at least one activation public key.");
  for (const [kid, pem] of Object.entries(config.publicKeys))
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(kid) ||
      crypto.createPublicKey(pem).asymmetricKeyType !== "ed25519"
    )
      throw new Error("Activation keys must be named Ed25519 public keys.");
  return { ...config, issuer: config.activationUrl };
}
function loadConfig(root = __dirname) {
  return validateConfig(
    JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          fs.existsSync(path.join(root, "config.runtime.json"))
            ? "config.runtime.json"
            : "config.json",
        ),
        "utf8",
      ),
    ),
  );
}
module.exports = { validateConfig, loadConfig };
