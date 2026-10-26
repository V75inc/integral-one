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

The task-owned evidence directory is `/Users/eldonmarks/.codex/worktrees/integral-one-signed-qualification-2026-10-26`. It contains candidate assets, accepted notarization IDs, build/verification logs, bootstrap and native updater drivers/results, screenshots, the retained synthetic home and its backup. Task-owned auxiliary engines were stopped after checks. The lower-version fixtures stay outside `candidate-assets`. The exact `0.1.6` product is left open on the separate test Mac for inspection.

## Corrected candidate `0.1.6`

The application was rebuilt with desktop host `0.1.7-dev.13` and unchanged Core rc35, app ID, data paths and recovery keys. Apple submission `02cd0d51-2287-449d-b53c-de9ac6f6d8b8` was Accepted. Strict signature verification, stapled-ticket validation, Gatekeeper and maintained-source/package parity passed. Application source is `8d0488c5723edd3c2d433a40446be0d6b995057c`; later report-only updates do not change packaged application code. ASAR SHA-256 is `2d010f84fd13ddfadf640b252d594db6bd8d593465ac13a7b5e4a8d3418b86d7`.

The fixed ZIP is `integral-one-0.1.6-mac-arm64.zip`, 151,769,321 bytes, SHA-256 `9af0084679773d14f07f75bffe91d042147d40d9ef53214c00ccfdfab4558c44`. Its schema-2 manifest and `latest-mac.yml` are bound to those bytes. Bootstrap metadata selection, first install, reinstall and corrupted-download rejection passed using unchanged production verification logic with local unpublished responses and task-owned destination paths.

`npm run verify` passed 171 Node and 16 Python tests, desktop-host passed 52 tests, and the composed UI built with all 2,246 UI tests passing across 366 files. The actual engine upgrade/settings/cold-restart rehearsal passed before signing. Regression checks cover managed-Python arguments, provisioning past five minutes, its 30-minute bound, unchanged operation bounds, sanitized progress and sandboxed status rendering.

Evidence for this candidate is under `qualification-0.1.6` inside the task directory. This is a separate immutable candidate from `0.1.5`; neither is a published release. The separate Mac then passed the complete native two-version update rehearsal into this exact ZIP. Its signed/notarized `0.1.5` QA fixture was composed from the corrected source and Core rc35, with a test entrypoint; it is not the previous exact `0.1.5` product. Fixture notarization submission `3ee02759-16a3-4a58-99b0-124f353f1573` was Accepted. The previously installed exact `0.1.5` app was preserved and its runtime stopped before placing the fixture. The original synthetic profile, installation and account files were retained.

The following passed again: startup/manual checks, decline, SDK checksum rejection, valid download with Later and normal quit retaining `0.1.5`, approved restart, one additional cold backup/account-key copy, native signature acceptance, replacement and automatic relaunch of `0.1.6`. No explicit launch of `0.1.6` was performed. The verifier attached to its already-owned Core runtime, confirmed the fixed ASAR, original entry, installation identity/keys, account/setup-key files, timezone and pinned App, and checked the new backup. The report records `automaticRelaunch: true`. Post-update strict signature and Gatekeeper checks passed on the test Mac. QA helper Launch Services registrations were removed and the exact product was registered.

Only unpublished release/feed responses and consent actions were supplied by the fixture. Real TestPyPI metadata, production manifest validation, native SDK checksums, publisher signatures, actual engine shutdown/backup and unmodified candidate bytes were retained. Activation was synthetic; these checks do not establish real Logto sign-in.

## Real account acceptance on the separate Mac

The owner then completed real browser authentication in the exact signed `0.1.6` product, using fresh task-owned user-data and Core homes on the same separate Mac. The earlier synthetic updater profile was preserved. The product ASAR remained `2d010f84fd13ddfadf640b252d594db6bd8d593465ac13a7b5e4a8d3418b86d7`; no account fixture or application patch was used for these checks. Passwords, email addresses and verification codes were entered directly by the owner on that Mac.

### Existing account

The owner confirmed that the first account already existed. Real browser sign-in and the native callback opened the workspace, and the local setup signature and configured Logto issuer were verified. Core rc35 reached ready. A controlled App, Track and entry were created through the ordinary local owner API, with a timezone and pinned App retained for comparison.

The following passed:

1. Cold restart without another sign-in, retaining the entry, account subject, installation identities, setup key, installation secrets, timezone and pinned App.
2. The real sidebar account menu's Sign out action showed the signed-out screen and prevented a new native session. A second browser sign-in/callback opened the workspace again, with the same account and retained local data/keys. The displayed native profile matched the verified sign-in profile.
3. A cold launch with an app-scoped denying HTTP(S) proxy opened the workspace and displayed the retained entry. A probe inside the actual application main process confirmed that the configured account service was unreachable while the local Core API remained reachable.
4. While that outage remained active, Sign out again denied a new native session; the actual Continue offline action reopened the local workspace and its saved entry. Identity, keys, account binding, timezone and pin comparisons passed again. The account service remained unreachable at the end of the check.

The outage was scoped to the app's HTTP(S) traffic; Wi-Fi and the Mac's global networking were not disabled. An earlier OS sandbox wrapper conflicted with Electron child sandbox initialization and exited before opening the workspace. That wrapper was discarded, and no Electron sandbox or application security setting was disabled. The successful proxy rehearsal used the unchanged signed product. Its proxy process was stopped before the next test.

Private task evidence is under `real-signin-0.1.6`: timestamped verification, actual UI actions and main-process network probes. Public reports omit real account details, identifiers, token material and key hashes.

### New account

In a second fresh profile, the owner chose signup with a second email, completed verification in the browser and confirmed that a newly created account opened the workspace. Native Restart sign-in requested the login prompt rather than silently reusing the first browser session. The verified subject differed from the existing-account baseline. Setup completed automatically without a separate activation action, and the displayed native profile matched the verified sign-in profile.

A new controlled entry was visible in the actual workspace. Cold restart retained activation, both installation identities, the local setup key, installation secrets, account binding, saved entry, timezone and pinned App, without requesting sign-in again. Evidence is under `new-signup-0.1.6` in the same remote task directory.

During acceptance the owner reported inconsistent display-name adoption. The native account profile and the canonical Core local profile are separate. The correction and its separate qualification are recorded below; successful browser activation alone did not establish correct display-name initialization.

## Display-name correction `0.1.7`

The new-account diagnostic confirmed that the verified account contained a nonblank name while Core still stored its bootstrap default `Owner`. The UI correctly used Core's saved display name; the missing step was copying the account's name into that local profile.

One now initializes the canonical display name through Core's existing authenticated loopback profile API before opening the workspace. A private installation-bound completion marker prevents later sign-ins or starts from overwriting a local edit, including a deliberate change back to `Owner`. Existing nondefault local names are retained. Empty account names defer initialization; nonblank full name, given/family name and username fallbacks are supported. Initialization failure preserves access to activated local data. No Core wheel, local owner identity, account binding, signing/recovery key or data path is changed.

The neutral host `0.1.7-dev.14` adds only an optional trusted `beforeWorkspace({runtime})` composition hook. Account/provider mapping remains in One. The immutable host tarball is pinned by SHA-256 `5f427122812fe334aa0150eb066397bdfa6d7bed3419627e97456769dbc07416`; earlier tarballs and signed candidate ZIPs are retained.

Under Node 24.19.0, verification passed 188 Node and 16 Python tests, host tests passed 53, the UI built and all 2,246 UI tests passed across 366 files. The actual Core API rehearsal persisted the initial name, accepted a local edit, then retained the edit and owner identity through cold restart. The signed-build preparation also passed actual settings, backup and restart retention checks. These checks use new task-owned homes.

### Fixed signed package and separate-Mac checks

| Item | Verified value |
| --- | --- |
| One / Core | `0.1.7` / TestPyPI `0.1.1rc35` |
| Application source | `d1127f6` (later documentation only) |
| ZIP | `integral-one-0.1.7-mac-arm64.zip` |
| ZIP bytes | `151770276` |
| ZIP SHA-256 | `5cd0ca8a17ceabffc71717796a134869bcbadcbdc82dff546b3f149ca9c5ecdb` |
| App ASAR SHA-256 | `97fa40b70a77e4e1e660ef274c9e2452e1fd3114a82fffb6723a935260f18d04` |
| Apple submission | `ff73c8d3-a73d-454f-8d18-be22da6c35d0`, Accepted |

Deep/strict signature, Gatekeeper, stapled-ticket and maintained-source/package inspection passed. Metadata selection, corrupt-download rejection, signed first install and signed reinstall passed with production bootstrap verification and task-owned destinations. The schema-2 manifest and update YAML bind this exact ZIP. These are new fixed bytes; `0.1.5`, `0.1.6` and their original carriers were preserved.

Before installing on the separate Mac, both real-account runtimes were stopped and each received a cold Core backup plus a copy of its One account state. The exact previous `0.1.6` app was retained. On the signed `0.1.7` package, both existing-account and new-account profiles now showed the verified account name in the canonical Core API and the actual sidebar menu. Their original entries, activation, account binding, installation identities/keys, setup key, timezone and pinned App were retained.

The actual Settings → Profile → Save name action saved a controlled local name in the new-account profile. It remained in the API and sidebar after cold restart. The account name was then restored through the same Settings action. A first verification attempt read a stale local origin during restart; the external driver was corrected to follow the current runtime URL, and verification passed without changing application bytes.

### Native update into the exact `0.1.7` package

The separate Mac then ran the original, unchanged signed `0.1.6` product in its preserved synthetic default profile. External main-process instrumentation supplied only unpublished GitHub release/feed responses and deterministic test consent. It invoked the actual native Help → Check for Updates action. Real TestPyPI publication metadata, production release validation, SDK checksums, normal shutdown/backup and Squirrel publisher signature validation remained active. Both product entrypoints and signed app archives were unchanged.

The offered `0.1.7` downloaded, made one additional cold backup with account-key copies, replaced the app through Squirrel and automatically relaunched the exact signed `0.1.7` in the normal default profile. No explicit launch of `0.1.7` was performed during this updater rehearsal. Its ASAR matched the fixed candidate. The original entry, installation identity/keys, One account/setup-key files, timezone and pinned App were retained. Post-update strict signature and Gatekeeper checks passed. The real-account test homes remained stopped and preserved during this synthetic updater check. Private evidence is under `native-update-0.1.7` on the separate Mac and `qualification-0.1.7` in the local task directory.

## Publication hold

No signing secrets were added to CI. Hosted candidate run `40396366548` failed before signing because its notarization credentials were absent; the approved local Keychain build supplied the qualified candidate. The explicit local/hosted route correction is documented in [installer release](INSTALLER-RELEASE.md#configuration-failure-found-on-26-october). No tag, GitHub release, visibility change or deployment was made.

Clean activation, new-account signup and real browser sign-in/callback journeys passed in `0.1.6`; the corrected signed `0.1.7` also passed retained real-account activation and display-name checks as described above. Complete qualification on each advertised platform before publication. The updater-retention fixture used a synthetic account. Windows signing/native update acceptance is not established by this Mac run. Core rc35 requires a development prerelease, with the matching manifest, ZIP, update YAML, fixed bootstrap and notices published together after approval.
