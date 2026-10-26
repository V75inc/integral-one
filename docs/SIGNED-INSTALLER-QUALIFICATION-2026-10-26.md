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

The SDK's automatic relaunch was disabled only in the test fixture, because Squirrel does not carry the task's profile/home arguments into a relaunch. The exact candidate was reopened explicitly with those arguments. This establishes native replacement and cold-launch continuity; automatic relaunch in a normal default profile remains a separate acceptance check. Real rc33/rc34 → rc35 engine upgrade rehearsals are recorded in [the source qualification](DISTRIBUTION-QUALIFICATION-2026-10-26.md).

## Local regression checks and evidence

After the bootstrap correction, `npm run verify` passed 171 Node and 16 Python tests, host tests passed 49, the composed UI built, and all 2,246 UI tests passed across 366 files. Package inspection passed again.

The task-owned evidence directory is `/Users/eldonmarks/.codex/worktrees/integral-one-signed-qualification-2026-10-26`. It contains candidate assets, accepted notarization IDs, build/verification logs, bootstrap and native updater drivers/results, screenshots, the retained synthetic home and its backup. Test engines were stopped after checks. The lower-version fixture stays outside `candidate-assets`.

## Publication hold

No signing secrets were added to CI. Its waiting candidate was superseded by the approved local Keychain build. No tag, GitHub release, visibility change or deployment was made.

Before publication, complete normal-profile automatic relaunch and clean-machine acceptance on each advertised platform, and the real browser sign-in/callback journey. The local account used for update retention was synthetic. Windows signing/native update acceptance is not established by this Mac run. Core rc35 requires a development prerelease, with the matching manifest, ZIP, update YAML, fixed bootstrap and notices published together after approval.
