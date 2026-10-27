# Installer release runbook

This is the maintainer counterpart to [Install Integral One](INSTALL.md). Prepared code is not a published installer. Publication, production configuration and signing-material use require the applicable approvals.

## Core runtime releases and the 0.1.9 host

One 0.1.9 introduces independent qualified Core updates and automatic native
notifications. Installed 0.1.8 needs one signed host upgrade to enable this lane.
Qualify the new host with the signed two-version updater before publishing it;
local runtime tests and ad hoc packaging do not replace that gate.

Subsequent compatible Core releases use the separate
[Core publication workflow](CORE-RELEASE-UPDATES.md), with immutable runtime
payloads outside the signed application. They require no Electron rebuild or
native signing keys. Runtime payloads are not signed/notarized installers and
must never be included in `install-manifest.json` or the native update YAML.

## Deliverables

The owner-selected initial launch targets Apple Silicon Macs on macOS 14+. Intel is blocked by Core runtime compatibility; see [platform readiness](PLATFORM-READINESS.md). A stable GitHub release tagged `vX.Y.Z` must contain:

- `integral-one-X.Y.Z-mac-arm64.zip`
- `install-manifest.json`, assembled from the verified platform parts
- `install.sh`, `install.ps1`, LICENSE, NOTICE and LICENSING.md
- `latest-mac.yml`, assembled from the verified Apple Silicon ZIP for the in-app updater

Windows is optional: add `integral-one-X.Y.Z-win-x64.exe` and its manifest entry only after Windows signing and clean-machine qualification. A missing Windows certificate does not block the macOS release.

Windows build preparation requires its approved publisher certificate. Signed
installation and two-version updater acceptance remain release gates. The
unsigned Windows development workflow remains available.

Use exact filenames; the bootstrap rejects unexpected names/versions. Each manifest entry contains its SHA-256, byte length and verified Apple Team ID or Windows signing-certificate thumbprint. Downloads use the specific version from the manifest, so a later latest-release change cannot silently mix versions. Normal HTTPS, OS signatures and notarization acceptance remain required; no unsigned-install override exists.

The Node/Python/uv source prerequisites are build tools, not end-user requirements. Each installer includes the native host, public account configuration, Core wheel and uv launcher; first startup automatically obtains the Python/runtime dependencies it needs.

## 1. Prepare the approved source

1. Complete the [release gates](RELEASE-GATES.md), including production account configuration, dependency/component review and supported-platform qualification.
2. Set matching **stable** `package.json.version` and `distribution.json.product_version`. Development suffixes cannot generate a public bootstrap manifest.
3. Keep the app ID, user-data name and existing local identities/keys unchanged.
4. Configure production accounts using a public configuration file. Use the configuration-v3 [Logto PKCE gate](SPEC-logto-account-gate.md). Retain existing local account records and recovery keys. Never package service secret keys.
5. Review bootstrap scripts and release provenance together with the actual source being signed.

## 2. Prepare signing and the protected CI environment

The local V75 Inc. Developer ID certificate and Keychain notarization profile are verified. The owner-approved `0.1.5`, corrected `0.1.6` and display-name correction `0.1.7` Mac candidates were accepted by Apple on 26 October; [signed qualification](SIGNED-INSTALLER-QUALIFICATION-2026-10-26.md) records their exact bytes, tests and publication hold. Follow the [macOS signing walkthrough](MACOS-SIGNING.md). No Windows certificate is currently available; follow the [Windows signing walkthrough](WINDOWS-SIGNING.md) and leave Windows disabled in this signed workflow until the chosen provider adapter is qualified. A separate unsigned Windows development workflow permits native engineering independently of Apple.

Without an explicit opt-in, local Keychain signing is the default route. After owner-approved credential setup on 26 October, this repository now sets `ONE_CI_SIGNING_ENABLED=true` and uses the protected hosted route. Automatic Core-pin pushes run the source/target plan and explicitly skip hosted signing, without requesting signing-environment approval or claiming a signed artifact. PR qualification still runs on Linux, macOS and Windows. The local Keychain is not accessible to GitHub-hosted runners.

For an approved hosted signing route, configure the GitHub environment **desktop-release** with required reviewers and appropriate branch restrictions **before** adding signing secrets. An explicit manual dispatch requests hosted signing. To also request it automatically after pin changes, opt in with repository variable `ONE_CI_SIGNING_ENABLED=true`; leave it absent or `false` for local signing. Protection is checked before entering signing jobs, and credential presence is checked before dependency setup. This workflow cannot publish a release.

| Setting | Purpose |
| --- | --- |
| Variable `ONE_PRODUCTION_ACCOUNT_CONFIG` | Public JSON accepted by `desktop/accounts/config.js`; configured production Logto issuer and public client ID |
| Repository variable `ONE_CI_SIGNING_ENABLED` | Optional `true` enables automatic hosted signing; absent/`false` retains the local route |
| Secrets `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD` | Developer ID Application certificate/P12 and its password |
| Secrets `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization credentials/team |
| Legacy Windows fields `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD` | Do not populate as a new-cert enrollment recipe; the Windows provider adapter still needs qualification |

Clerk secret keys and receipt-signing private keys stay on the account service, not in this workflow's public account variable or the desktop. A hardware/cloud Windows signing service needs its own reviewed signing adapter; the prepared workflow uses the certificate-file route. Do not export a non-exportable private key to fit this example.

## 3. Build candidates

Core pin changes on main automatically start the **Signed installer candidate** plan. With local signing selected, its summary directs the maintainer to the designated Mac and no signed build/assembly job runs. With hosted signing explicitly requested, the protected environment gates the build. For a reviewed hosted run, manually dispatch it with the exact stable source version. Leave **include_windows** off for the initial macOS launch. The hosted route uses a native macOS arm64 runner (plus Windows x64 only when explicitly enabled), builds the source, runs qualification, signs/notarizes, inspects packages and generates per-platform installer manifests. It then installs assembly dependencies before validating manifests and assembling a downloadable candidate bundle. No `contents: write` permission or GitHub Release publication step is present.

### Configuration failure found on 26 October

[Run 40396366548](https://github.com/V75inc/integral-one/actions/runs/40396366548) passed source setup and UI tests but failed before signing because Apple notarization credentials were absent. A live metadata check found no repository or `desktop-release` signing secrets; only the public account configuration variable was present in that environment. Local signing/notarization success does not provision hosted signing. The workflow now follows the explicit route above and reports missing secret names early, without printing their values. At the time of that failure no key export or credential upload had been performed. The owner later explicitly approved the selective identity/credential transfer into `desktop-release`. Hosted run [40410680336](https://github.com/V75inc/integral-one/actions/runs/40410680336) then passed actual signing, Apple notarization and assembly; downloaded-artifact checks are recorded in [signed qualification](SIGNED-INSTALLER-QUALIFICATION-2026-10-26.md#publication-hold). Historical run results are preserved; rerunning that old workflow revision would still require its hosted credentials.

Equivalent native commands after source setup:

```sh
npm run build:installers -- --signed
npm run release:manifest
```

Set the public account config and signing/notarization environment through the approved secret mechanism. On the qualified local Mac, `APPLE_KEYCHAIN_PROFILE=integral-one-notary` uses the existing Keychain credential without exporting its password. Missing or incomplete notarization configuration now fails before signing. Run `npm run qualify:ui:dependencies` before the final runtime/package build and retain its emitted-file hashes with the unresolved tooling-advisory disposition. `build:installers` without `--signed` is a development build; it cannot pass public manifest/signature checks.

After gathering the Apple Silicon Mac output into a directory:

```sh
node scripts/installer-manifest.js merge release-assets release-assets/install-manifest.json
```

The merge requires the Apple Silicon Mac artifact and rejects Intel assets, duplicate platforms, mixed versions and altered installer bytes. Include the reviewed bootstrap scripts and notices with those outputs.

The native signing hook refreshes the bundled launcher's hash after its child
signature and before the outer app resource seal. The immutable Core wheel hash,
launcher signature, final app seal and packaged runtime are all checked. Ordinary
macOS CI reproduces this ordering with ad hoc signing; Developer ID notarization
and clean-machine acceptance remain release checks.

Signed builds also run `node scripts/qualify-upgrade.js resources/core
--require-settings` before signing, with signing credentials removed from the
runtime child's environment. The rc28 negative control failed this journey on HTTP 403 settings writes.
The published rc29 pin includes the correction; the exact composed candidate
must pass the complete journey before signing. See [Core publication updates](CORE-RELEASE-UPDATES.md).

Then run `node scripts/update-metadata.js release-assets` to generate the
Mac update feed from those verified artifacts. Include it with the matching ZIPs;
never overwrite it with a runner-specific YAML. Signed Mac preparation enables the
updater. Development candidates use TestPyPI and GitHub prereleases; stable builds use PyPI and ordinary GitHub releases. See [auto-updates](AUTO-UPDATES.md)
for automatic checks, download/restart approvals and required two-version native QA.

## 4. Qualify the real installation path

On clean supported machines with no developer prerequisites:

1. Verify the exact signed application/installer and publisher; validate Gatekeeper/notarization on macOS and Authenticode on Windows.
2. Exercise manifest selection, actual release download/redirects, corrupted-download rejection, install and first launch.
3. Complete production email and enabled social sign-ins; verify the correct account and first local record.
4. Restart offline; sign out and sign in again; verify retained records and account binding.
5. Repeat installation with the app closed and confirm data retention. A running app must yield a clear quit/retry message.
6. Qualify recovery, uninstall-with-data-retention, installation failure and OS security prompts. Do not bypass those prompts to mark the check passed.

`install.sh --check` / `install.ps1 -Check` inspect stable-release metadata without installing. `--download-only` / `-DownloadOnly` download and verify the signed release into Downloads without installing. They still require published assets; they are not unsigned-development backdoors.

Windows PowerShell execution and clean-machine Windows install have not been qualified on the current macOS workstation. The bootstrap includes only macOS arm64/x64 and Windows x64. Do not advertise Linux or native Windows ARM64 until their runtime and installer paths pass equivalent checks.

## 5. Publish deliberately

Create a **draft** GitHub release for the verified `vX.Y.Z` tag and upload all matching assets. Complete signing/installer/account readback and review checksums before publishing it as the stable latest release. Do not publish the bootstrap separately against incomplete assets. Publication is a separate authorized operation; this runbook does not execute it.

The one-line commands initially use GitHub Releases directly. A short `onintegral.ai` install URL can be added later as an HTTPS redirect once its DNS/site deployment is approved. Domain setup is not required for the GitHub download channel itself; account sign-in uses the configured Logto issuer.

If a release is broken, stop promoting it as latest and point new installs to a known-good complete signed release. Installed workspace data must be preserved. Retain signing-key history and old receipt verification keys according to the release/key-custody policy.

## References

- [electron-builder v26 macOS](https://www.electron.build/v26/docs/mac/), [NSIS](https://www.electron.build/v26/docs/nsis/)
- [GitHub native runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Current first-release qualification](FIRST-RELEASE-QUALIFICATION.md)

## Local implementation checks — 18 October 2026

- Native macOS arm64 development ZIP build and existing package integrity/notice inspection passed.
- Bash and PowerShell parsing passed. The actual PowerShell HTTPS redirect/download helper completed under a task-local macOS PowerShell runtime; this is not Windows install evidence.
- Installer build configuration and manual workflow YAML were inspected/parsed. Windows defaults to off.
- The public-release metadata check returned a clear unavailable-release error against the currently unpublished assets; no application was installed by that check.
- Public manifest creation rejected the current development version. No signing identity was used, no signing credentials were created and no release was published.
- Signed macOS/Intel/Windows clean-machine installation and the full public download-to-signup path remain unqualified until their actual production assets exist.

Release manifests use schema 2 and bind each installer to its Core version, package index, source wheel hash and channel. Publish TestPyPI candidates as GitHub prereleases, with `install-manifest.json`, bootstrap scripts, `latest-mac.yml` and (when present) `latest.yml` alongside the exact installer files. The workflow prepares this bundle; public release publication remains an explicit action.
