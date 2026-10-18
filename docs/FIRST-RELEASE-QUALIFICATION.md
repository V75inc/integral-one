# First-release qualification — 18 October 2026

## Decision

The macOS arm64 development candidate passes the installation, account and local-workspace checks below. **Public release remains blocked.** This is an unsigned development ZIP using Clerk's development instance and an uncommitted Core snapshot. It is not evidence of production service readiness, Gatekeeper acceptance, Windows/Linux support or clean-machine qualification.

## Exact candidate

- Integral One `0.1.0-dev.0`, Electron `44.9.0`, shared desktop host `0.1.7-dev.0`.
- Core development wheel/UI pinned by `distribution.json`; stable `ai.integral.desktop` identity and `Integral` data directory retained.
- ZIP SHA-256: `637bdade3c3bf6be77ca0616d368af4abe50ba15c7384c5e857f74b35edf2fc3`.
- Actual macOS arm64 ZIP built, extracted into a task-owned installation folder, and launched from that extracted application.
- Fresh Core home, Electron profile, uv cache and Python installation directory; existing machine tools and network remain available. Initial setup downloads runtime dependencies. This is not a completely offline first installation or a clean OS image.
- Reserved Clerk development email and test verification code used. Development signups are not production adoption metrics.

## Current results

| Check | Result | Evidence / scope |
| --- | --- | --- |
| ZIP packaging and extracted app launch | PASS | Actual extracted app opened signup; unsigned local execution only |
| Package integrity and retained Apache notices | PASS | Wheel/uv hashes, desktop profile, required account assets and LICENSE/NOTICE/LICENSING checked; source-only/internal files excluded |
| Fresh signup and verified email | PASS | Native Clerk form, automatic registration, Core opened without a separate activation action |
| Signed-in identity | PASS | Signed account email shown in desktop account menu; local owner ID unchanged |
| Local use without an AI provider | PASS | Created App, Track and Post through native UI; edited and searched the saved record |
| Sign out and sign back in | PASS | Welcome-back screen, Clerk email/code sign-in, retained App and record |
| Cold restart during account-service outage | PASS | Service stopped; `UV_OFFLINE=1`; Core restarted, signed profile and exact edited record remained available |
| Single-owner perimeter | PASS | Unauthenticated record read, missing native controller secret, foreign browser origin, local signup and collaborator creation denied |
| Cold backup and reviewed restore | PASS | Core CLI backup restored into a different empty home; stable installation ID, rotated session authority, enforced quarantine; independent checkpoint review/apply and exact-record readback |
| Theme contrast | PASS | Black logo for light system surfaces, white for dark, live update verified using actual Electron; theme listener now starts before account onboarding |
| Automated frontend suite | PASS | 1,879 tests, 330 files |
| One account/distribution/composition checks | PASS | 34 Node + 3 Python tests |
| Shared desktop-host checks | PASS | 27 tests including icon readiness before onboarding |
| Core desktop-profile suite | PASS | Current focused suite exited successfully; complete Core release gate remains outstanding |
| Private account-service checks | PASS | 14 tests; current service audit reports zero advisories |
| Root/UI dependency audit | BLOCKED | Root: 8 moderate; UI: 5 high, 3 moderate. See dependency review; advisory counts include dependent paths |
| Live social sign-in on this exact ZIP | NOT TESTED | Google return passed earlier development-package qualification; Microsoft has not completed live consent/return qualification |
| AI inference, voice and attachments on this ZIP | NOT TESTED | No provider credentials, OS permissions or file upload exercised in this pass |
| Signed installer, Gatekeeper and upgrade from released version | NOT TESTED | No signed/notarized release artifact or released predecessor |
| Windows/Linux installs and remote CI | NOT TESTED | This pass is macOS arm64 only |

Detailed task-local evidence is retained under `.local/verification/first-release/` and `/tmp/integral-one-first-release-*.log`. Those paths contain test identifiers and are not public release assets.

## Findings to carry into release preparation

1. **Production account service:** configure the shared production Clerk instance, production Google/Microsoft credentials, HTTPS `accounts.onintegral.ai`, receipt-verification public keys, service deployment/health, privacy notice and production signup/sign-in/outage/metrics qualification. Keep secret keys on the service. One and Business share account identity, not local workspace access grants.
2. **Dependencies and provenance:** resolve or formally qualify current advisories, replace the Core/host development snapshots with approved upstream artifacts, run independent Core release gates and remote CI, and complete component licensing/rights review. Apache-2.0 and inherited notices remain in place; Business stays private.
3. **Distribution:** obtain the appropriate signing/notarization setup and qualify download, quarantine/Gatekeeper, install, upgrade, uninstall-with-data-retention and recovery on every advertised OS/architecture.
4. **First-run expectations:** internet is needed for signup and initial runtime installation. Cached local use survives account-service outages. Do not advertise offline first installation; show a clear first-run download explanation/progress before public release.
5. **Backup experience:** the qualified backup/recovery path currently uses the Core CLI. Its archive contains local data and encryption keys, but not One's separate `one-account/activation.json` receipt. Preserve that receipt separately for offline recovery, or sign into the same Integral account again to obtain an installation-bound receipt. Document and qualify the complete desktop recovery UX before launch; never overwrite an existing home.
6. **Local-session meaning:** Continue offline deliberately permits the OS user to resume the local workspace after sign-out. Sign-out is not a filesystem lock. Some record bylines still display the stable local "Owner" label; the account menu shows the verified account email.
7. **Desktop presentation:** generic Core App/Track creation still displays shared/public visibility choices. The desktop perimeter denies collaboration/public sharing, but those choices need a desktop-specific presentation pass to avoid misleading first-time users. No server access checks should be weakened to make a control appear to work.
8. **Supported app experience:** this fresh distribution contains no preinstalled domain App packages. Blank App/Track/Post use works without AI. Qualify the intended starter library and developer extension install path before advertising a marketplace or Business migration as available.

## Theme implementation

The native icon uses the system-integrated appearance, independently of the workspace's theme. On macOS this is the Dock icon; this product does not currently create a separate menu-bar Tray item. The host applies the chosen icon as soon as Electron is ready, before the potentially long account setup hook, then updates on appearance changes. Electron's nativeTheme contract is documented at https://www.electronjs.org/docs/latest/api/native-theme.
