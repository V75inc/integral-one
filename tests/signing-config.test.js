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

test('preparation gets public build settings while signing credentials remain confined to the signer', () => {
  const { releasePreparationEnv } = require('../scripts/signing-config');
  const original = { PATH: '/tools', INTEGRAL_ACCOUNT_CONFIG: '/public/config.json',
    INTEGRAL_UV_BINARY: '/tools/uv', APPLE_APP_SPECIFIC_PASSWORD: 'not-a-real-password',
    APPLE_KEYCHAIN_PROFILE: 'signing-profile', CSC_LINK: 'not-a-real-certificate',
    CSC_KEY_PASSWORD: 'certificate-password', MACOS_CSC_LINK: 'mac-certificate',
    WINDOWS_CSC_KEY_PASSWORD: 'windows-password', GH_TOKEN: 'github-token',
    GITHUB_TOKEN: 'actions-token', CLERK_SECRET_KEY: 'service-secret' };
  const safe = releasePreparationEnv(original);
  assert.deepEqual(safe, { PATH: '/tools', INTEGRAL_ACCOUNT_CONFIG: '/public/config.json', INTEGRAL_UV_BINARY: '/tools/uv' });
  assert.equal(original.CSC_LINK, 'not-a-real-certificate');
});
