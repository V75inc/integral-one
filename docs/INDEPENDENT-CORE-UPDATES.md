# Independent Core updates

## Contract

One 0.1.9 introduces a separate Core runtime delivery channel. Electron/app-shell changes still use signed native installers. Compatible Core changes use an immutable composed wheel and notices in a qualified runtime package. TestPyPI development and PyPI stable policies remain separate. No new Electron binary, signing identity or notarization submission is needed for each Core update.

A Core publication triggers a scheduled/dispatched One runtime qualification build from its exact upstream tag and published wheel. The build composes One's host UI, verifies licenses/engine provenance, runs UI/runtime/upgrade checks and publishes a complete runtime release only after those checks pass. This preserves native identity and branding without installing Node on users' computers. A package-index publication alone does not bypass compatibility checks.

The desktop discovers releases automatically while open, on resume and manually through Help. The update panel and optional OS notification explain availability, download progress and restart readiness. Download and restart require separate consent. Opt-out and Later remain supported; ordinary quit does not install a pending update.

Runtime files live in the existing private Integral user-data directory, outside the signed application. The bundled reviewed uv executable remains the launcher. Manifest, wheel, UI inventory, package-index pin, product/host/runtime contract and supported-platform checks precede selection. No arbitrary executable, command arguments, feed URL or account identifier comes from update metadata.

Before activation the owned engine is stopped and a cold backup including One account state and integrity keys is made. A complete cold home snapshot permits recovery if a trial startup fails. The old runtime remains available; changes are journaled and selected atomically. The original workspace path, account binding and recovery keys remain stable. Failed or interrupted activation must recover before normal host startup; rollback must never run against a foreign/live process.

## Acceptance

- Native host requires one signed 0.1.9 upgrade from 0.1.8; subsequent compatible runtime releases do not require rebuilding that host.
- Exercise actual rc35 to rc36 update, display name/record/key/account/timezone/pin retention, cold restart and interrupted/failed activation recovery in task-owned homes.
- Reject changed hashes, yanked/wrong-index wheels, incompatible contracts/platforms, path traversal, symlinks, oversized archives, foreign runtime ownership and incomplete backups.
- Qualify real native notifications, download/Later/restart choices and persistent restart state without mutating the signed app bundle.

The implementation has passed the local checks below. This document does not authorize a new public host or runtime release.

## Local qualification, 27 October 2026

The source implementation has passed local qualification in task-owned homes:

- Actual published TestPyPI rc36 wheel matched upstream tag `710fb2a738dce7ac624b63644fb9dfe99ca6f4cd`. Its SHA-256 is `aea8ef1a7a6afe47ed4b705977847b56da71740eb5baf9277e6ac2111ac97af1`.
- An rc35 installation staged the composed rc36 payload without installing, required a separate restart request, activated rc36 and reopened cold. Account proof, installation/setup keys, existing records, chosen display name, timezone and App pin were read back unchanged. The desktop runtime resources were hashed before/after and stayed unchanged.
- A failed trial restored rc35 and the full previous home, retained the failed home and passed the same account/data checks and cold reopen. Unit tests cover interrupted trial/recovery journal phases and live foreign-process refusal.
- The real Electron native panel ran with sandbox/context isolation, no renderer Node access, stale-action rejection, Later/Download/Restart choices and download progress. Native notification submission was exercised; OS delivery is not asserted by the harness.
- One verification: 226 Node tests and 21 Python tests passed. Local Apple Silicon development packaging passed source/runtime/license inspection and native ad hoc seal verification; its bundled engine passed startup, profile readback and cold restart.
- Baseline UI: 2,246 tests across 366 files; rc36 UI: 2,289 tests across 371 files. Both UI builds and production dependency-closure checks passed. Desktop-host contract tests: 53 passed.

`node scripts/qualify-independent-runtime.js <runtime-assets> <baseline-wheel-directory> <fresh-report-directory>` reproduces the actual runtime-manager qualification. It uses real engine processes, package downloads, validation, backups and stores. Only the unpublished GitHub payload transport and app relaunch are supplied by the harness. Account proofs are synthetic local fixtures; this is not a new real browser sign-in acceptance result.

The bundled fallback remains rc35 so that the new host can receive rc36 through the independently qualified lane and recover to the previously accepted engine. The temporary rc36 preparation checkout and runtime ZIP are local test artifacts, not published releases. Local development packaging uses only an ad hoc identity. Developer ID/notarization, signed 0.1.8 → 0.1.9 acceptance on the other Mac, public feed delivery and release publication remain separate gates.
