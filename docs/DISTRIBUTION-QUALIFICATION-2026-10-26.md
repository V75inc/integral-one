# Integral One rc35 distribution candidate

This candidate combines the menu/chrome work from [PR #4](https://github.com/V75inc/integral-one/pull/4), including head `59b2eaf20514464020e9617f1cfb2bdd59c83e0c`, and the Logto PKCE work from [PR #12](https://github.com/V75inc/integral-one/pull/12), head `bea37b4d307bde7c9f3a34203831facdb861383f`. PR #12 already contains that menu head. The integration preserves that ancestry and the native session-renewal safeguards.

## Composition

- Integral One: `0.1.5`.
- Core: published TestPyPI `0.1.1rc35`, tag/source `17f14ba3126fbbe93e71b5b19df4005d39a78709`.
- Source wheel SHA-256: `1956ca24832ea4927109a127f599a7d0e973262d844f87cfcd25c685273f0712`.
- Desktop host: `0.1.7-dev.12`, including the menu work and cold-update backup contract.
- Electron: `44.9.3`. This replaces the affected 44.9.0 pin following [GHSA-jr5w-w6x2-84p9](https://github.com/advisories/GHSA-jr5w-w6x2-84p9). The compatible `fast-uri` tooling patch was also applied.
- Stable app ID `ai.integral.desktop`, user-data name `Integral`, account files and recovery-key locations are retained.

## User behavior

Supported installed builds check after startup and every six hours. Help provides a manual check, the automatic-check preference and the active channel. Stable builds query PyPI and ordinary One releases; development builds query TestPyPI and One prereleases. Checks also report a newer Core series, while installation requires a complete qualified One installer whose Core version and wheel hash match the selected package index.

A new Core publication without an installer is reported as being prepared. A matching installer prompts for download, then separately for restart/install. Normal quit does not install it. The SDK keeps checksum and native publisher verification, and One adds a SHA-256/size check against the selected manifest.

Before replacement, One stops its owned engine, saves a cold Core archive, and copies its account record and local setup key into `update-backups` under the existing user-data directory. Any failed stop, backup, account copy or downloaded-byte check prevents installation.

The one-line bootstraps support stable and development channels, validate their Core pin against PyPI/TestPyPI, and retain native publisher verification. [Install instructions](INSTALL.md#development-release-candidates) contain the development commands. No end-user Node, Python or Git installation is required.

## Local evidence

| Check | Result |
| --- | --- |
| `npm run verify` | 170 Node tests and 16 Python tests passed. |
| `npm run test:host` | 49 passed, including renewal authority, Windows menu IPC and update backup failures. |
| Composed UI build and `npm run test:ui` | Build passed; 2,246 tests passed in 366 files. |
| `npm run qualify:ui:dependencies` | Production closure passed for 3,730 modules; the advisory-affected package is excluded from the bundled runtime. |
| Root `npm audit` and production-only audit | Zero reported vulnerabilities after the patches above. This is not an audit of every bundled Python/native component. |
| Runtime qualification | Pinned rc35 startup, private local contract and owner session passed. |
| rc33 → rc35 and rc34 → rc35 rehearsals | Cold backup, One account/key copies, App/Track/record retention, owner keys, binding, timezone, pinning, model-settings transport and cold restart passed. |
| Bootstrap metadata checks | Native macOS fixture checks passed for both channels and rejected wrong channels, yanked packages and changed Core hashes. The equivalent Windows checks run in native CI. |
| Package build/inspection | Apple Silicon development ZIP built with signing explicitly disabled. ASAR source parity, runtime hashes, notices, public updater configuration and exclusion of local/internal state passed. |
| Native desktop smoke | Packaged source opened the Logto account window and a task-owned offline activated workspace. The Help updater performed real TestPyPI/GitHub checks; the File menu opened AI settings. Screenshots were inspected. |
| Live public service checks | Logto discovery exposes the pinned issuer, S256 and ES384/P-384 keys. TestPyPI reports rc35; no stable PyPI Core or matching installable One release was available during the check. |

The native smoke uses real Electron windows, packaged source/resources and a synthetic local account in isolated homes. It observes protocol-registration calls without changing the machine's default protocol handler, and records update dialogs without approving downloads. It does not create a cloud account or establish signed installation/update acceptance. The owned engine is stopped at test completion.

The release environment's public `ONE_PRODUCTION_ACCOUNT_CONFIG` was updated from Clerk v2 to the reviewed Logto v3 configuration. Signing secrets and the human approval protection were not changed.

PR verification now retains and checks the base branch's actual published wheel before building the candidate. Its upgrade test therefore exercises the previous Core version rather than replacing the candidate with itself.

Native CI builds the actual Mac ZIP and Windows NSIS targets before package inspection. Electron-builder omits `app-update.yml` for directory-only Mac/Windows builds, so those directory targets cannot qualify the enabled updater's shipped feed configuration.

## Remaining distribution acceptance

The source implementation is prepared for distribution. Actual signed/notarized release assets are still required. With approval to use signing material, build and test signed version A and version B on every advertised platform, including download rejection, a real native update, first startup, local account continuity, records and recovery. Complete the real browser sign-in/callback journey in the released package. Windows also requires the approved certificate-store/provider configuration and native installer acceptance.

The rc35 candidate belongs in the **development** channel because its Core publication is on TestPyPI. Publish its matching installers, schema-2 manifest, update YAML and bootstrap scripts together as a GitHub prerelease after acceptance. Stable distribution requires an eligible PyPI Core publication and the stable channel. Signing, notarization and release publication remain explicit approved operations; this qualification did not perform them.

Legacy Clerk account records are preserved and are not silently mapped to Logto subjects. Their existing local recovery action remains available. There is no operational-data upload or production-store migration in this integration.
