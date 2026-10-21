# Core publication to installed One update

**Decision:** prepare and qualify a complete One release for each eligible Core
publication. The owner selected this delivery model on 21 October 2026. One's
native host, branded UI and engine remain one tested distribution. Installed
applications do not replace their engine directly from a package index.

## Publication detection and preparation

`core-update-policy.json` explicitly selects the registry, supported Core series
and prerelease policy. It currently follows **TestPyPI, Core 0.1, including
prereleases**, matching the project's current publication channel. For a stable
production channel, change this reviewed policy to PyPI with prereleases disabled
after the appropriate Core versions are published there. Neither source tags
alone nor an unqualified version bump are a package publication.

The **Prepare One from published Core** workflow checks every six hours and also
accepts manual dispatch or the `integral-core-published` repository-dispatch event.
Scheduled workflows become active only after this workflow lands on the default
branch. No external dispatch credential is required for polling.

The repository already permits Actions to create update PRs. The release
environment is configured with `eldonm` as its required human reviewer, only
`main` allowed for deployments, and the public production account configuration.
Signing secrets are not configured; no signing key was exported or used to set
up this environment.

1. Find a newer, non-yanked universal wheel in the selected registry. Respect
   numeric PEP 440 prerelease ordering and the approved major/minor series.
2. Check the exact wheel size and published SHA-256, then compare every packaged
   Python file and the Apache LICENSE/NOTICE with the exact `v<version>` Core tag.
3. Export that tag's immutable UI source, refresh the wheel/UI/provenance pins and
   propose the next One patch version. The desktop host and existing app/data
   identifiers remain unchanged.
4. Run the One tests, UI build, production dependency-closure check, runtime and
   package checks on Linux, macOS and Windows. Exercise a previous-Core store
   through backup, app-style engine replacement and authenticated record readback.
   Preserve installation secrets, owner access and the local One setup record.
   Require timezone and App pin writes/readback and model-credential validation
   admission before the candidate can proceed.
5. Only after all three native jobs pass, open a draft source PR on
   `codex/core-<version>`. Existing candidate branches are left intact. Explicitly
   dispatch ordinary PR verification, since a bot-token PR does not itself start
   normal GitHub Actions PR workflows.

The preparation and native build jobs have read-only repository permissions and
no release secrets. A separate final job receives source-PR permissions; it only
applies the validated pin/artifact paths and invokes Git/GitHub, without executing
the candidate's build code. Repository settings must allow Actions to create PRs.
An incompatible release, unavailable tag, changed hash, failed upgrade, build
failure or publication outage fails preparation without changing installed apps.

## Delivery to machines

The source PR is reviewed and merged. Changes to the Core pins on `main`
automatically start the protected signed-candidate workflow, which then
builds the initial Apple Silicon installer for macOS 14+ with production public account settings,
Developer ID signing and notarization. It assembles the matching ZIP,
`install-manifest.json` and a single `latest-mac.yml`. It requires a protected
`desktop-release` environment with human reviewers and branch restrictions before
any signing job can start; missing protection fails preparation. The explicit
manual dispatch remains available for reviewed reruns.

The read-only plan first resolves the selected Mac runtime dependencies, before
requesting signing-environment approval. Intel currently fails this check; the
owner selected Apple Silicon first. See [platform readiness](PLATFORM-READINESS.md).

Signed preparation also requires a real temporary-home desktop journey to pass:
App/Track/record creation, backup/restart, timezone, pinning and model-credential
request admission. The rc28 negative control failed this gate with HTTP 403. The reviewed rc29
release containing #165 is published and composed; its actual consumer journey
is required before signing.

After the exact installers and a signed version-A-to-version-B update are approved,
publish those assets together as the next stable **Integral One** release. The
installed One updater discovers it, asks before download and restart, stops its
owned Core process, and installs the complete distribution. Automatic checks stay
opt-in. Network/account outages do not invalidate existing local access.

This workflow prepares tested source updates; it does not automatically merge,
use signing keys, publish installers or bypass native platform security. Windows
development packaging is checked, but signed Windows distribution and updates
remain a separate platform qualification.

## Signing integrity

The macOS signing hook checks the original bundled wheel and launcher hashes,
lets the standard Electron signer sign native children, verifies the launcher,
then records its signed hash **before** the outer application seal is produced.
The wheel is unchanged. The final application signature and runtime hashes are
verified again. There is no post-sign manifest edit or disabled hash check.

Ordinary macOS CI exercises this ordering with the real signer and an ad hoc
identity; no Developer ID key is used. This proves hash/seal ordering, not
Gatekeeper acceptance or notarization. Those checks require the actual signed
release artifacts and approved signing-material use.

See [auto-updates](AUTO-UPDATES.md) and the [installer runbook](INSTALLER-RELEASE.md).
