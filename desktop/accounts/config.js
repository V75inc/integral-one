"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ISSUER = "https://auth.saas.apps.trueselph.com/oidc";
const FIELDS = new Set([
  "contractVersion",
  "provider",
  "setupMode",
  "configured",
  "environment",
  "appId",
  "issuer",
]);
function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("Only public account configuration fields are accepted.");
  if (Object.keys(config).some((name) => !FIELDS.has(name)))
    throw new Error("Only public account configuration fields are accepted.");
  if (
    config.contractVersion !== 3 ||
    config.provider !== "logto" ||
    config.setupMode !== "logto" ||
    config.issuer !== ISSUER ||
    typeof config.appId !== "string"
  )
    throw new Error("Unsupported Integral Account configuration.");
  if (typeof config.configured !== "boolean")
    throw new Error(
      "Account configuration must explicitly state whether it is configured.",
    );
  if (
    config.environment !== undefined &&
    !["production", "development"].includes(config.environment)
  )
    throw new Error("Unsupported account environment.");
  if (!config.configured) return config;
  if (!["production", "development"].includes(config.environment))
    throw new Error("Unsupported account environment.");
  if (config.appId.length < 1)
    throw new Error("A public App ID is required.");
  return config;
}
function loadConfig(root = __dirname) {
  const file = fs.existsSync(path.join(root, "config.runtime.json"))
    ? "config.runtime.json"
    : fs.existsSync(path.join(root, "config.production.json")) &&
        (() => {
          try {
            return (
              JSON.parse(
                fs.readFileSync(
                  path.join(root, "config.production.json"),
                  "utf8",
                ),
              ).configured === true
            );
          } catch {
            return false;
          }
        })()
      ? "config.production.json"
      : "config.json";
  return validateConfig(
    JSON.parse(fs.readFileSync(path.join(root, file), "utf8")),
  );
}
module.exports = { validateConfig, loadConfig };
