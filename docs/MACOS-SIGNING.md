# Finish the macOS one-command release

You already have an Apple Developer membership. The remaining Apple setup is a **Developer ID Application** signing identity and notarization access. A Windows certificate is not needed for the initial Mac launch.

The V75 Inc. organization team and its Developer ID Application identity were verified locally on 18 October 2026. The issued certificate matches the user-created CSR and has its matching private key; Apple’s G2 intermediate is present in login. Certificate expiry is 17 November 2027. No private key was exported and no custom trust override was added. Notarization credentials and actual signed-release qualification are still pending.

## 1. Sign into the right Apple team

Open [Apple Developer account](https://developer.apple.com/account/) and confirm your membership/team. Use the team authorized to distribute Integral One. The signer displayed by macOS comes from that Apple team; do not assume that a personal membership will display V75 Inc.

You complete Apple login, MFA and any agreements yourself. We can review the visible team and certificate settings together without sharing credentials in chat.

## 2. Prepare Developer ID Application signing

Follow [Apple's Developer ID certificate instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/). Use **Developer ID Application**, which signs an app distributed directly outside the App Store. This ZIP-based route does not need a Developer ID Installer certificate.

Use the required Account Holder role for certificate creation. If creating a new local key/CSR, complete that credential-creation step yourself in Keychain Access or Xcode. Install the resulting certificate on the Mac that holds its matching private key. Do not revoke existing certificates or export unrelated identities.

**Done when:** the intended Developer ID Application identity is present with its matching private key and valid chain. A maintainer can confirm availability through a read-only signing-identity check.

## 3. Prepare notarization access

Follow [Apple's notarization instructions](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution). The prepared electron-builder workflow uses the Apple ID, team ID and an app-specific password. Create/enter credentials yourself and keep them in the approved secret store, never chat, a shell transcript or the repository.

For CI, configure the protected `desktop-release` environment as described in [installer release](INSTALLER-RELEASE.md). The certificate-file route needs an appropriately protected P12 export of this identity; if you prefer to keep the key local, sign locally using the same reviewed build and a separately approved notarization setup. Do not export a key merely for convenience without agreeing its custody.

**Done when:** the intended signing and notarization route is configured. Actual signing-key use and submission to Apple are explicit release actions, not part of a source preview build.

### Local Keychain profile (no password in command history)

Sign in to [Apple Account](https://account.apple.com/) as the Apple Developer account holder. Under **Sign-In and Security → App-Specific Passwords**, create a password labelled **Integral One notarization**. Complete credential creation yourself; do not send it in chat.

Run this command in your local terminal, then enter that app-specific password at the hidden prompt:

```sh
xcrun notarytool store-credentials integral-one-notary --apple-id developer@v75inc.com --team-id M43V972XU9 --keychain "$HOME/Library/Keychains/login.keychain-db"
```

The tool validates the credentials before saving them to the local login Keychain. Do not use `--password` with a literal secret and do not use `--no-validate`. This step authenticates the account; it does not submit an application to Apple.

For an approved local signed build, electron-builder supports `APPLE_KEYCHAIN` pointing to that Keychain file and `APPLE_KEYCHAIN_PROFILE=integral-one-notary`. `CSC_NAME` can select the verified Developer ID identity. These values contain no password. Keep signing/notarization and production release gates separate from the credential setup.

## 4. Finish signup configuration

Complete the [Clerk and Cloudflare walkthrough](CLERK-CLOUDFLARE-SETUP.md), including the launch account architecture decision. The installer must contain public production configuration so users never enter API keys or configure a server. Email/social consent remains the normal user signup step.

## 5. Sign, qualify and publish

Build the approved Apple Silicon candidate for macOS 14+, confirm signatures and notarization acceptance, and qualify the actual clean-machine installation, signup and offline restart. Complete the other release gates, then publish the reviewed stable release assets and bootstrap together.

Only then does the one-line command become live:

```sh
curl -fsSL https://github.com/V75inc/integral-one/releases/latest/download/install.sh | /bin/bash
```

Users run it without sudo. It downloads, verifies, installs and opens One; first runtime preparation is automatic. It never removes quarantine attributes, disables Gatekeeper or asks the user to install developer tools.
