"use strict";
function validateMacNotarization(env = process.env) {
  // Match electron-builder's credential precedence. Its notarize=true option
  // otherwise only warns and skips notarization when credentials are absent.
  if (env.APPLE_ID || env.APPLE_APP_SPECIFIC_PASSWORD) {
    if (!env.APPLE_ID || !env.APPLE_APP_SPECIFIC_PASSWORD || !env.APPLE_TEAM_ID)
      throw new Error(
        "Complete the Apple ID/password/team notarization configuration.",
      );
  } else if (
    env.APPLE_API_KEY ||
    env.APPLE_API_KEY_ID ||
    env.APPLE_API_ISSUER
  ) {
    if (!env.APPLE_API_KEY || !env.APPLE_API_KEY_ID || !env.APPLE_API_ISSUER)
      throw new Error("Complete the Apple API notarization configuration.");
  } else if (!env.APPLE_KEYCHAIN_PROFILE?.trim()) {
    throw new Error(
      "Signed Mac candidates require notarization credentials. For this Mac, set APPLE_KEYCHAIN_PROFILE=integral-one-notary.",
    );
  }
}
module.exports = { validateMacNotarization };
