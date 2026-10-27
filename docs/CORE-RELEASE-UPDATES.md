# Core publication to installed One update

## Independent runtime delivery

One 0.1.9 introduces a compatible runtime lane. It replaces the earlier requirement to rebuild the entire desktop for every Core publication. Installed One 0.1.8 needs one signed desktop upgrade first. New shell/host features still require signed native installers.

`core-update-policy.json` selects qualified runtime delivery, automatic publication after qualification, TestPyPI development releases and the approved Core 0.1 series. Stable distribution requires a reviewed PyPI policy with prereleases disabled. Only actual non-yanked package publications qualify; a source tag is insufficient.

The **Qualify independent Core update** workflow checks every six hours on the default branch. Manual dispatch and `integral-core-published` repository dispatch are also supported. It has no native signing credentials and does not change the desktop version, merge source PRs or rebuild Electron.

1. Find an eligible newer universal wheel, verify its size/hash against the package index, and fetch the exact upstream `v<version>` tag. Compare published Python files and LICENSE/NOTICE against that tag.
2. Preserve any existing `core-v<version>` release, including drafts. Refresh Core/UI/provenance pins only in the qualification checkout, retaining the bundled baseline for upgrade tests.
3. Run One and host tests, UI build/tests and production module-closure review, compose the branded runtime, inventory dependencies/notices, and run runtime and existing-store upgrade qualification on Linux and Apple Silicon macOS.
4. On macOS, package the composed wheel/notices, independently verify/extract it, then exercise the actual runtime manager against the prior wheel. Require explicit download/restart separation, cold backup, trial activation, signed local account proof/key/record/display-name/timezone/pin retention, cold reopen and failed-trial restoration. Only `darwin-arm64` is advertised initially.
5. After every qualification job passes, a separate main-only writer job verifies the One source revision and payload bytes, creates a draft `core-v<version>` release, uploads its two assets, reads back GitHub asset hashes/sizes and publishes the complete release. Development runtimes are prereleases and never marked Latest. Existing assets are never overwritten. Failed draft publication is retained for review rather than automatically retried over existing bytes.

Preparation and qualification use read-only repository permissions. Only the final job has contents-write permission, and it does not execute downloaded candidate code. A source incompatibility, missing tag, changed hash, failing test/upgrade or index outage prevents publication. This workflow becomes active only after the reviewed implementation reaches `main`.

## Runtime assets and contract

Each release has `runtime-manifest.json` and `integral-one-runtime-<version>.zip`. The manifest binds product/channel, original Core registry/version/wheel hash, exact One/Core source commits, composed wheel hash, payload hash/size, qualified platforms, host contract and compatible One range. The initial range is One 0.1.9 through versions below 0.2.0, host contract 1.

The ZIP contains a universal Core wheel with One's UI plus dependency notices. It is not an installer and must not be manually executed. Neither the runtime ZIP nor its manifest is Apple signed/notarized. The application uses fixed HTTPS release authorities, validates hashes/provenance and verifies all engine/license bytes against the independently downloaded upstream wheel. It executes through its existing reviewed launcher outside the unchanged signed app bundle. See [code signing policy](../CODE_SIGNING.md) for that trust boundary.

A package-index publication can precede qualification. In that interval, One reports that compatibility checks are pending. It offers only complete matching qualified runtime releases. No end-user Node installation or source build is required.

## Native host releases

Native host updates remain reviewed signed candidates with separate publication approval. The protected `desktop-release` environment requires a human reviewer and restricts signing to approved source/branches. Developer ID signing/notarization is configured for Apple Silicon; signed One 0.1.8 is publicly available as a development prerelease. Windows signing/distribution and Intel Mac qualification remain separate work.

The signing hook verifies bundled inputs, signs the native launcher and updates its hash before sealing the outer app. No post-sign manifest edit occurs. Local ad hoc qualification proves packaging/hash ordering, not Gatekeeper or notarization acceptance. A new host must pass the applicable signed installer and two-version updater checks before publication.

See [automatic updates](AUTO-UPDATES.md), [independent runtime design](INDEPENDENT-CORE-UPDATES.md), [platform readiness](PLATFORM-READINESS.md) and [installer runbook](INSTALLER-RELEASE.md).
