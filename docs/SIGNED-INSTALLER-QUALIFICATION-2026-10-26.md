# Signed Mac installer and updater qualification

On 26 October 2026 the owner explicitly approved signing, notarization and local installer/updater testing, with publication held. The local Keychain route was used. No private key was exported and no release was published.

## Fixed candidate

| Item | Verified value |
| --- | --- |
| Product | Integral One `0.1.5`, development channel |
| Core | TestPyPI `0.1.1rc35` |
| Application source | `afb109326698437dd6c51a790797fc48940a8596` |
| App ID / team | `ai.integral.desktop` / `M43V972XU9` |
| Publisher | Developer ID Application: V75 Inc. |
| Target | Apple Silicon, macOS 14+ |
| ZIP | `integral-one-0.1.5-mac-arm64.zip` |
| ZIP bytes | `151768736` |
| ZIP SHA-256 | `c57d857ef745d97df604e7535e4a8726bba9183502f70b40622ac0b449b0de08` |
| App ASAR SHA-256 | `6b8ac007b9fd93cf7e3197a855bf3d215bbf43171ebb8f3c445f6a48c4632f30` |
| Apple submission | `1dcf16da-d106-4705-913b-92e82a7ad0eb`, Accepted |

Strict deep signature verification, designated requirement validation, stapled-ticket validation and Gatekeeper assessment passed. Gatekeeper reported `Notarized Developer ID`. Package/source, runtime and notice inspection passed. The installer manifest and update YAML were generated from this exact ZIP. Preserve these bytes for the candidate; a rebuilt signed ZIP is a different artifact.

The bootstrap fix described below changes the separately distributed `install.sh`. It does not change the signed application or its ASAR.

## Installation rehearsal

The production macOS bootstrap was run against the real signed candidate, with unpublished release responses supplied by a local fixture. TestPyPI publication validation used the real service. Only the GitHub download adapter, destination paths and final launch command were replaced in the test copy. Signature, Gatekeeper, checksum, archive, identity and replacement checks were retained.

- Metadata selection, first installation and same-version reinstallation passed.
- Corrupted ZIP bytes were rejected before extraction or installation.
- A valid signed lower-version fixture was rejected as a downgrade, retaining `0.1.5`.
- Replacing a running application was rejected with the quit/retry instruction.
- The exact installed candidate opened its account onboarding window in an isolated profile.

This exercise found a bootstrap defect that metadata-only checks missed: macOS `/bin/bash` treated the Unicode ellipsis adjacent to `$version` as part of the variable name. The download status message now uses `printf`, and a regression test executes the download path through corrupted-byte rejection.

## Native updater rehearsal

An unpublished, signed and notarized `0.1.4` fixture was composed from the same application source and Core rc35, with an explicitly identified test entrypoint. Its Apple submission `aea06b55-591b-46bb-95a5-d8285762e910` was Accepted. This fixture is not the historical One rc34 build and must never be distributed.

The fixture used the production release validation, update coordinator, backup code and real electron-updater/Squirrel pipeline. GitHub release metadata was supplied locally because `0.1.5` is unpublished; real TestPyPI metadata bound the Core pin. After validation, only the SDK feed transport was redirected to a loopback server. The candidate ZIP, SDK checksums and native signature verification were unchanged. Automated dialog responses exercised consent deterministically.

The following passed:

1. Automatic startup check and manual check.
2. Declining a download without a backup or application replacement.
3. SDK SHA-512 rejection of a same-size corrupted ZIP, with failure feedback.
4. Valid download followed by Later and normal quit, leaving `0.1.4` installed.
5. A subsequent approved installation, one cold Core backup and copies of the One account record and setup key.
6. Native Squirrel signature acceptance and replacement by the exact `0.1.5` candidate.
7. Strict signature, stapled-ticket and Gatekeeper acceptance of the replaced app; ASAR equality with the fixed candidate.
8. Explicit cold launch of the updated app in the same isolated homes. The retained entry was inspected in the UI and API. Installation identity/keys, account files, timezone and pinned App matched the pre-update state and backup.
9. The exact candidate's native Help → Check for Updates dialog performed the live TestPyPI/GitHub check and reported its result.

The SDK's automatic relaunch was disabled only in the test fixture, because Squirrel does not carry the task's profile/home arguments into a relaunch. The exact candidate was reopened explicitly with those arguments. This establishes native replacement and cold-launch continuity; the separate-Mac rehearsal below completes automatic relaunch in a normal default profile. Real rc33/rc34 → rc35 engine upgrade rehearsals are recorded in [the source qualification](DISTRIBUTION-QUALIFICATION-2026-10-26.md).

## Separate-Mac automatic restart

A separate Apple Silicon Mac running macOS 15.7.7 was accessed through the owner-authorized SSH route, with its test account logged into the desktop. It initially contained no Integral installation or data. The same fixed `0.1.5` candidate was transferred with a signed/notarized lower-version QA fixture; the SDK's automatic relaunch remained enabled. The product's ordinary `Integral` user-data and Core paths were used.

Automatic/manual checks, decline, corrupted download rejection, Later/normal quit, one cold backup, native replacement and automatic restart all passed. No explicit launch of `0.1.5` was performed. Its running process and already-owned runtime were checked after restart. The retained entry, installation identity/keys, One account record/setup key, timezone and pinned App matched their pre-update values. The installed ASAR matched the fixed candidate, and strict signature verification and Gatekeeper assessment passed on that Mac. The native updater result records `automaticRelaunch: true`.

The first verification driver encountered an Electron ASAR filesystem error while hashing the raw archive. It was rerun using `original-fs` from the existing signed helper's Node mode. This corrected only the external verification driver; the installed candidate bytes and its running process were unchanged.

### First-start defect found during this rehearsal

The first cold launch exceeded the host's five-minute CLI timeout while downloading Python/runtime dependencies. Reopening after provisioning resumed succeeded. This is a failed first-start check, even though the subsequent updater/relaunch checks passed.

The follow-up `0.1.6` source uses desktop host `0.1.7-dev.13`: uv-managed Python 3.12 only, a 30-minute startup/provisioning bound, and fixed download/setup messages in the sandboxed startup window. Ordinary stop/session/backup operations retain the five-minute bound. Reopening reuses completed downloads. This is a new candidate and does not replace the fixed `0.1.5` artifact's bytes or its recorded results. The corrected launcher completed a real, empty-cache rehearsal on the separate Mac: Python and dependencies downloaded, Core rc35 reached ready after 485,455 ms, and the owned runtime stopped successfully at 486,908 ms. No second launch or manual Python installation was needed. The new signed package and updater checks are recorded separately below.

A developer-tools prompt was separately triggered by a maintainer's `xcrun stapler` check on the test Mac, which has no developer tools installed. Developer tools are not an end-user prerequisite; signature and Gatekeeper checks on that machine use built-in tools. Stapled-ticket validation was already completed on the signing Mac.

## Local regression checks and evidence

After the bootstrap correction, `npm run verify` passed 171 Node and 16 Python tests, host tests passed 49, the composed UI built, and all 2,246 UI tests passed across 366 files. Package inspection passed again.

The task-owned evidence directory is `/Users/eldonmarks/.codex/worktrees/integral-one-signed-qualification-2026-10-26`. It contains candidate assets, accepted notarization IDs, build/verification logs, bootstrap and native updater drivers/results, screenshots, the retained synthetic home and its backup. Test engines were stopped after checks. The lower-version fixture stays outside `candidate-assets`.

## Corrected candidate `0.1.6`

The application was rebuilt with desktop host `0.1.7-dev.13` and unchanged Core rc35, app ID, data paths and recovery keys. Apple submission `02cd0d51-2287-449d-b53c-de9ac6f6d8b8` was Accepted. Strict signature verification, stapled-ticket validation, Gatekeeper and maintained-source/package parity passed. ASAR SHA-256 is `2d010f84fd13ddfadf640b252d594db6bd8d593465ac13a7b5e4a8d3418b86d7`.

`npm run verify` passed 171 Node and 16 Python tests, desktop-host passed 52 tests, and the composed UI built with all 2,246 UI tests passing across 366 files. The actual engine upgrade/settings/cold-restart rehearsal passed before signing. Regression checks cover managed-Python arguments, provisioning past five minutes, its 30-minute bound, unchanged operation bounds, sanitized progress and sandboxed status rendering.

Evidence for this candidate is under `qualification-0.1.6` inside the task directory. This is a separate immutable candidate from `0.1.5`; neither is a published release. The native two-version update rehearsal for `0.1.6` remains pending until its exact ZIP is installed and verified.

## Publication hold

No signing secrets were added to CI. Its waiting candidate was superseded by the approved local Keychain build. No tag, GitHub release, visibility change or deployment was made.

Before publication, complete the corrected candidate's clean first-start acceptance, qualification on each advertised platform, and the real browser sign-in/callback journey. The local account used for update retention was synthetic. Windows signing/native update acceptance is not established by this Mac run. Core rc35 requires a development prerelease, with the matching manifest, ZIP, update YAML, fixed bootstrap and notices published together after approval.
