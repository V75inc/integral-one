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
  ]);
  if (!config || Object.keys(config).some((name) => !fields.has(name)))
    throw new Error("Only public account configuration fields are accepted.");
  if (config.provider !== "clerk" || config.contractVersion !== 1)
    throw new Error("Unsupported Integral Account configuration.");
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
  const clerk = new URL(config.clerkIssuer),
    service = new URL(config.activationUrl);
  const testLoopback =
    config.environment === "development" &&
    config.publishableKey.startsWith("pk_test_") &&
    service.protocol === "http:" &&
    service.hostname === "127.0.0.1";
  if (
    config.environment === "production" &&
    !config.publishableKey.startsWith("pk_live_")
  )
    throw new Error("Production builds require a production Clerk instance.");
  if (
    clerk.protocol !== "https:" ||
    clerk.origin !== config.clerkIssuer ||
    clerk.hostname !== host ||
    (service.protocol !== "https:" && !testLoopback) ||
    service.origin !== config.activationUrl
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
