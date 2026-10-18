# Windows signing and installer preparation

Integral One targets Windows x64 with a per-user NSIS installer. End users will
need one PowerShell command, without Node, Python, administrator access or a
separate activation step. The command is prepared, but no trusted Windows release
has been published. Apple notarization does not gate Windows engineering.

## Current status

- Windows bootstrap, installer configuration and package checks are prepared.
- A separate manual **Windows development installer (unsigned, manual)** workflow
  can build an internal candidate without Apple credentials or production secrets.
  It has not been dispatched. It uploads a seven-day development artifact only.
- Native Windows installation, signup, offline restart and recovery remain
  unqualified. macOS PowerShell parsing/download checks do not establish them.
- V75 Inc. does not yet have a Windows signing certificate/provider configured.
- Production account configuration and the common release gates still apply.

## Choose the publisher and provider

**Owner-selected investigation: SignPath Foundation**, 18 October 2026. Assess the
free OSS route before purchasing a V75 Inc. certificate. See the
[application preparation](SIGNPATH-APPLICATION.md) for the live eligibility gaps
and draft application. This is not an approval, application submission or signing
service enrollment. A paid organization certificate remains a fallback only.

| Route | Fit and constraint |
| --- | --- |
| Organization certificate with cloud signing | Preserves V75 Inc. as publisher; validation, paid subscription and provider integration required |
| SignPath Foundation | Free OSS signing application is possible, not guaranteed; the publisher is SignPath Foundation. Its release, reputation, privacy and approval conditions need review before applying |
| Microsoft Artifact Signing public trust | Current supported organization countries do not include Guyana; do not enroll using an incorrect country |

Do not assume a newly issued certificate has an exportable PFX private key.
KeyLocker stores signing keys in its service. A client-authentication P12 used by
a signing service is not the code-signing private key. Never substitute one for
the other or export a protected key to fit a build example.

## Organization enrollment walkthrough

1. Confirm the certificate will display **V75 Inc.** and that Guyana incorporation
   is eligible. Obtain a quote for the certificate, cloud signing, usage limits,
   renewal and any validation fees.
2. Prepare the legal registration details, registered business address and a
   reachable organizational contact. Supply validation documents directly to the
   certificate authority when requested; do not put them in Git or chat.
3. The authorized owner completes account terms, purchase, identity verification
   and MFA. No order or account has been created by this preparation.
4. Provision the signing key in the provider's hardware/cloud service. Install
   its official Windows tools/KSP and synchronize the issued public certificate
   into the signing user's Windows certificate store using the provider's guide.
5. Record the approved public certificate thumbprint, exact publisher and expiry.
   Keep provider authentication in its credential store or protected CI secrets.
6. Qualify signing on a Windows x64 runner. Protect release approval before
   granting signing access. A GitHub-hosted Windows runner does not already have
   the provider's tools, key access or certificate store configured.

## Native build using a Windows certificate store

The pinned electron-builder supports a certificate-store thumbprint. Once the
provider's KSP/key access is configured, the local build selects the exact public
certificate using `ONE_WINDOWS_CERT_SHA1`; it does not export the private key.

```powershell
$env:ONE_WINDOWS_CERT_SHA1 = 'THE_40_HEX_CHARACTER_APPROVED_CERTIFICATE_THUMBPRINT'
$env:INTEGRAL_ACCOUNT_CONFIG = 'C:\secure-build\public-production.json'
npm run build:installers -- --signed
node scripts/inspect-package.js
npm run release:manifest
```

Matching stable versions and production account configuration are required.
The manifest must verify the actual installer and installed executable before
publication. The existing cross-platform signed workflow still needs the chosen
provider's Windows setup adapter; its old Windows PFX secret fields alone are
insufficient. Leave `include_windows` off until that adapter is reviewed and
qualified. Do not add provider secrets to this unsigned development workflow.

For internal development only, `npm run build:installers` on Windows explicitly
disables executable signing. It does not produce a public manifest and the public
bootstrap rejects unsigned installers. Do not tell users to bypass SmartScreen.
A valid paid certificate also does not guarantee that SmartScreen will never
show a reputation warning; qualify the actual downloaded installer.

## Windows acceptance walkthrough

On a clean supported Windows x64 machine without developer tools:

1. Verify the downloaded NSIS installer and packaged application show the approved
   publisher and valid Authenticode signatures, including timestamp verification.
2. Use the published one-line PowerShell command as an ordinary user. Confirm the
   per-user installation, shortcuts and first launch without elevation.
3. Complete production email/Google signup, the return-to-app callback, and verify
   the signed-in email. Qualify Microsoft sign-in if advertised.
4. Create and reopen a record, restart offline, sign out and sign in again. Verify
   the same local workspace and records remain available as designed.
5. Check light/dark tray icons, minimize/quit, protocol handler and second-instance
   behavior. Reinstall/update with the app closed; preserve the `Integral` data
   directory, recovery keys and existing app ID `ai.integral.desktop`.
6. Exercise corrupt download rejection, unexpected publisher, interrupted install,
   uninstall with data retention, backup and restore. Record actual OS prompts.

Record Windows evidence separately from Mac results. Publish only after the
[installer release runbook](INSTALLER-RELEASE.md) and common release gates pass.

## Official references (checked 18 October 2026)

- [DigiCert code-signing enrollment](https://docs.digicert.com/en/certcentral/order-and-manage-certificates/request-certificates/request-a-code-signing-or-ev-code-signing-certificate/request-code-signing-certificate.html)
- [DigiCert KeyLocker](https://docs.digicert.com/en/digicert-keylocker.html)
- [Microsoft Artifact Signing prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [SignPath Foundation conditions](https://signpath.org/terms.html)
- [Pinned electron-builder Windows signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/)
