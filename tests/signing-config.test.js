"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateMacNotarization } = require("../scripts/signing-config");
test("signed candidates cannot silently skip notarization when credentials are absent or incomplete", () => {
  for (const env of [
    {},
    { APPLE_KEYCHAIN_PROFILE: " " },
    { APPLE_ID: "account" },
    { APPLE_API_KEY: "path" },
    { APPLE_ID: "account", APPLE_KEYCHAIN_PROFILE: "valid-profile" },
  ])
    assert.throws(() => validateMacNotarization(env));
  for (const env of [
    { APPLE_KEYCHAIN_PROFILE: "integral-one-notary" },
    {
      APPLE_ID: "account",
      APPLE_APP_SPECIFIC_PASSWORD: "test-only",
      APPLE_TEAM_ID: "TEAM123456",
    },
    {
      APPLE_API_KEY: "path",
      APPLE_API_KEY_ID: "key",
      APPLE_API_ISSUER: "issuer",
    },
  ])
    assert.doesNotThrow(() => validateMacNotarization(env));
});
