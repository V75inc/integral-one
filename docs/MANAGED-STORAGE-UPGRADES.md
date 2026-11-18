# Reviewed managed-storage upgrades

One's independent-runtime updater can apply a separately reviewed managed-storage
plan for an existing desktop home. Ordinary updates do not generate or approve
plans. The existing strict identity check still rejects an unreviewed credential
addition. This bridge requires a Core artifact exposing the reviewed storage APIs;
it does not change any published package pin.

## Operator workflow

1. Stage the intended composed runtime through One. Record its exact wheel path
   beneath `runtime-updates/releases/` and retain the old installer/runtime.
2. Stop the owned Core runtime and retain a verified cold database/attachment
   backup. Do not plan against a live installation. Run the following with the
   **selected staged wheel** using Core's installed maintenance command:

   ```sh
   uv tool run --managed-python --python 3.12 --index-url https://pypi.org/simple \
     --from "$WHEEL" integral storage-upgrade plan \
     --home "$CORE_HOME" --wheel "$WHEEL" --plan "$PLAN" \
     --max-indexes "$INDEX_LIMIT" --max-index-bytes "$RESIDENT_BYTE_LIMIT" \
     --max-build-bytes "$BUILD_BYTE_LIMIT"
   ```

   Supply explicit budgets suitable for the populated installation. Planning
   starts only the private database helper under Core's command/supervisor locks
   and stops it before returning. It does not launch the API, apply Core schema/index changes or add
   credentials. PostgreSQL performs normal startup housekeeping and reuses the
   saved administration password/authentication configuration. Existing plan files are never overwritten.
3. Review the saved plan's home, installation/configuration digest, wheel digest,
   catalog revision, database target, operations, role and budgets. This bridge
   refuses drops and repairs. Treat duplicate identities as a reconciliation
   issue; it never deletes rows to make a unique index succeed. Approval is the
   SHA-256 of the **whole plan file**, printed by the planning command.
4. Restart the old One runtime, then launch One with these explicit operator
   arguments and choose the staged runtime's normal restart/install action:

   ```text
   --storage-plan=/absolute/path/reviewed-plan.json
   --storage-approved-hash=<reviewed whole-file SHA-256>
   ```

   The host API also accepts
   `manager.install({storageMigration: {planPath, approvedHash}})`.
   Remove the migration launcher arguments after the update completes.
   This is an operator bridge, not a new end-user approval screen. If restarting
   the old runtime changes installation configuration, applying the plan fails
   closed; stop it and review a new plan against its current configuration.

## Apply and recovery guarantees

The updater validates and privately copies the approved plan before stopping the
old runtime. It retains the ordinary backup and full cold-home snapshot, including
attachments and One account state. The selected runtime applies the exact Core
plan, using a new restricted role whose credential is kept in a private sidecar.
That sidecar supports exact retries without rotating secrets. The runtime role
must pass Core's readiness and privilege inspection before its credential is
added to installation.json. Normal managed Core startup then verifies the existing
catalog instead of generating a replacement plan.

Only that successful migration's exact runtime password addition is admitted.
All existing key hashes and account bytes must remain unchanged, the on-disk
installation ID must match, and the runtime role cannot change during trial boot.
A failed migration or trial restores the original snapshot and retains the failed
home. An interrupted trial restores on next startup instead of silently retrying.
A database PID/readiness marker prevents recovery from renaming potentially live
storage; stop/reconcile that process before restarting recovery. Never erase a
marker merely to bypass this check. External database symlinks are unsupported.

Keep the reviewed plan, retained failed home and original backups until the
release is qualified. No destructive schema down migration is performed: rollback
restores the stopped database and attachment snapshot together.

## Qualification

`tests/runtime-manager.test.js` covers approval binding, identity tampering,
failures and recovery. Its opt-in pgserver cases use a **stopped disposable legacy
home** supplied as `ONE_STORAGE_FIXTURE` and a selected Core interpreter supplied
as `ONE_STORAGE_PYTHON`; each case clones that fixture into its own temporary home.
They verify real populated storage and attachment bytes after activation/rollback,
with a simulated Core API trial start. `tests/test_storage_migration.py` uses
`ONE_STORAGE_TEST_DSN` pointing at a disposable PostgreSQL cluster; it creates and
drops only uniquely named test databases/roles and checks interrupted index builds,
exact retries, configuration binding and denied runtime DDL/catalog writes.

These source tests are not a substitute for the final published composed-wheel,
actual API/UI trial, macOS/Windows installer and signing qualification. No stable
version has been selected by this change.

## Installer compatibility

The Core maintenance engine is shared with the runtime updater through a thin
adapter. A payload's minimum One version is the host product version used to
build it; before shipping a host change, bump that product version and qualify
its installer. Older hosts must not receive a managed-storage payload that needs
this updater.

## Reviewed replacement-installer path

A replacement host runs `installer-storage.js` under the desktop single-instance
lock, before serving startup. `bundle-runtime.js` inspects the composed wheel for
Core's native maintenance module and writes a wheel-hash-bound
`resources/core/storage-upgrade.json`. Package inspection checks that receipt and
the exact packaged migration code. A managed bundle refuses a legacy PostgreSQL
home without complete runtime credentials until an operator supplies approval.
Fresh installations continue through Core's normal initial provisioning.

1. Retain the previous installer and external runtime artifacts. Close the old
   desktop and stop its owned Core/database. Retain an independent verified
   database-and-attachment backup. Do not change the existing home path or keys.
2. Use the **replacement application's actual bundled wheel** with the Core
   `storage-upgrade plan` command above. Review the exact home, installation,
   wheel, catalog, operations, role and budgets. No migration is approved by
   merely installing or opening the new application.
3. Start the replacement executable with these explicit arguments (quote paths
   for the operating system):

   ```sh
   "$ONE_EXECUTABLE" --home="$CORE_HOME" \
     --installer-storage-plan="$PLAN" --installer-storage-approved-hash="$APPROVED_SHA256"
   ```

   Use the same user-data directory as the previous host. The host saves the
   approved plan privately, checks that the home is stopped, and copies the
   complete cold home to a sibling `.one-installer-snapshot-*` directory. It then
   applies Core's reviewed maintenance command, admits only the exact new runtime
   password receipt, trials the real owned API and stops it before normal boot.
   Existing secrets, installation ID and account bytes remain invariant. The cold
   snapshot is retained after success.
4. Failure restores the entire old home and retains the failed home in a sibling
   `.one-installer-recovery-*` directory. The replacement remains blocked: use
   the retained old installer to resume the restored legacy home. An external
   runtime selection is not discarded until replacement succeeds. If a process
   is still running, recovery refuses directory replacement; stop and review that
   process first, then reopen the replacement to finish recovery.
5. A failed or interrupted attempt never silently retries. After reviewing the
   failure and the new/existing plan against the restored home, an operator can
   explicitly retry with the two approval arguments above plus
   `--installer-storage-retry-hash=<previous-attempt-approved-SHA256>`. The prior recovery
   receipt and failed home remain retained. Do not manually erase the journal
   or snapshots to bypass recovery.

The private `runtime-updates/installer-storage.json` journal records ready,
trial, restoring, rolled-back and complete phases. Recovery resumes safely before
renames, after retaining the failed home and after restoring the snapshot.
Neither the journal nor a successful trial authorizes publishing an installer.

### Qualification and remaining release gates

The reviewed five-file adapter patch was integrated only after all original
working-file hashes matched its supplied manifest. The local host gate passes
260 JavaScript tests and 22 Python tests, with two opt-in skips in each suite.
The installer-specific tests include approval and wheel/home mismatch, live-home
refusal, partial credentials, identity tampering, whole-home/attachment rollback,
interrupted renames, explicit retry and old external-runtime selection retention.

Disposable populated-home qualification against Core candidate `dcc2c762`
(composed wheel SHA-256
`c3418927a14506be7a1fee0998a5aef24987e97dbd548a52bf0300d937a05689`)
passed success, forced trial failure and interrupted-trial recovery. Real API
sessions checked records, attachment hashes, installation identity and widget
registration; restored homes also passed the legacy API readback. Every runtime
was stopped, and snapshots/recovery homes were retained. This candidate is not a
published package.

An unsigned macOS arm64 directory bundle passed package inspection with updater
and signing disabled. This does not qualify Gatekeeper, notarization, DMG/ZIP
installation, a signed two-version host update, Windows or Intel Macs. The final
published wheel and new host version still need artifact-specific qualification.
Apple signing/notarization must use the separately approved release process.
Windows x64 requires its native installer/replacement tests and approved signing
provider; Intel macOS remains blocked by the documented Core dependency support
floor. No stable Core pin, host release version, signing or deployment is part of
this local migration change.

The final unsigned ASAR also passed a fresh populated-home replacement through
its Electron executable, including real API record/attachment readback and cold
restart. Its ASAR SHA-256 is
`3f47dc862176a45b66ef1eed1906269bbefacc9ff90bf90a3dfd00aeaa3678f5`.
One earlier packaged run reached a ready API but its Core startup command timed
out. Recovery refused to rename the still-live home; after test cleanup stopped
the runtime, packaged recovery restored the old home. Explicit retry and cold
readback passed, followed by the fresh final-package pass. The initial timeout's
cause remains undetermined and must stay in the release reliability review; these
later passes do not establish its resolution.

### Follow-up startup reliability qualification

Eight additional packaged cases passed, covering fresh upgrades, cold restarts,
forced trial rollback, actual application-bundle resources and home paths with
spaces. All 24 startup commands completed in 7.878–20.602 seconds. Forty-four
secret-free readiness probes found no ready-file/CLI disagreement, control
handshake failure or probe error. All tested runtimes were stopped. These repeats
did not reproduce or explain the earlier stall. A ready `runtime.json` alone is
not the full Core readiness contract: CLI status also validates the live process
and the local installation handshake.

The original exception could be obscured by recovery's live-home refusal. The
installer journal now saves a fixed failure stage and a safe error category
before recovery, without raw exception text, paths or credentials. Regression
tests cover a timed-out startup with a still-live process and an apply failure;
real packaged rollback confirms the diagnostic receipt survives restoration.
Readiness, ownership and live-home recovery checks remain enforced.

The final diagnostic build's unsigned macOS arm64 DMG checksum and read-only
contents inspection passed, as did ZIP extraction and inspection. Both contain
ASAR SHA-256
`a898973b3dcb2e15afbd0a84aa69e600e8f0fadf214727c3a9695db797038e0b`.
The DMG was detached after inspection. These are development artifacts with
signing and automatic updates disabled, not public installation candidates.
Signed installation/update acceptance and the unexplained original stall remain
in release review. Evidence and reproducible qualification harnesses are retained
in the task's `one-startup-reliability` directory; populated snapshots and failed
homes remain in their original task-owned locations.

The repeatable signed Mac, Windows and Intel execution gates and dated readiness
checks are in [managed release qualification](MANAGED-RELEASE-QUALIFICATION.md).
