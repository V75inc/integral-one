# Tasks: Windows development installer rehearsal

Spec: `docs/SPEC-windows-development-installer.md`

Plan: `tasks/plan.md`

## Task 1: Confirm the host toolchain session

**Description:** Set the build session to the Python 3.12 and uv 0.13.4 binaries already on this PC. Do not install tools and do not replace PATH uv 0.12.6.

**Acceptance criteria:**

- [x] `node -v` prints a v24 release
- [x] `PYTHON` is `C:\Program Files\Python312\python.exe` and prints a 3.12 version
- [x] `INTEGRAL_UV_BINARY` is `C:\v75\integral-one\.local\uv-0.13.4\uv.exe` and prints `uv 0.13.4`
- [x] `INTEGRAL_ACCOUNT_CONFIG`, `ONE_WINDOWS_CERT_SHA1`, `CSC_LINK`, and `CSC_KEY_PASSWORD` are unset in that session

**Verification:**

- [x] Manual check: the four version and environment results above are recorded in the session output
- [ ] Build succeeds: not this task
- [ ] Tests pass: not this task

**Dependencies:** None

**Files likely touched:** None

**Estimated scope:** Small: 0 files

## Task 2: Run source setup

**Description:** From the repo root, run `npm run setup` with the Task 1 environment. This installs locked dependencies, composes the UI, and bundles the local runtime. It does not sign or publish.

**Acceptance criteria:**

- [x] `npm run setup` exits 0
- [x] The log says setup is complete
- [x] The unconfigured account file remains `configured: false`

**Verification:**

- [x] Build succeeds: `npm run setup`
- [x] Manual check: closing setup text and no change to `desktop/accounts/config.json`
- [ ] Tests pass: not this task unless setup itself runs them

**Dependencies:** Task 1

**Files likely touched:** Generated output under `node_modules/`, `.build/`, and `resources/` only

**Estimated scope:** Small: 0 source files

## Task 3: Build the unsigned installer

**Description:** Run `npm run build:installers` with no `--signed` flag, using the same session environment. The script disables Windows executable signing and then runs package inspection.

**Acceptance criteria:**

- [x] The command exits 0
- [x] The log includes `Development installer built. It cannot pass the public bootstrap signature/release gates.`
- [x] `release\integral-one-0.1.2-win-x64.exe` exists

**Verification:**

- [x] Build succeeds: `npm run build:installers`
- [x] Manual check: the exe path and the closing log line
- [ ] Tests pass: package inspection runs inside `build:installers`

**Dependencies:** Task 2

**Files likely touched:** Generated output under `release/` and `resources/`

**Estimated scope:** Small: 0 source files

## Checkpoint: After Tasks 1-3

- [x] The unsigned exe exists at `release\integral-one-0.1.2-win-x64.exe`
- [x] The build was not `--signed`
- [x] The host profile was not used as an install target
- [x] Stop for the human to copy the exe into the Windows VM or sandbox

## Task 4: Install and reinstall in the guest

**Description:** The human copies the exe into the Windows VM or sandbox and runs it there as a normal user. Open Integral One from the shortcut, quit, and run the exe again with the app closed. This session does not install on the host.

**Acceptance criteria:**

- [ ] The guest install completes without accepting an administrator elevation prompt
- [ ] The guest has a desktop shortcut and a Start menu shortcut for Integral One
- [ ] Opening the shortcut shows the Integral Account window
- [ ] The second run, with the app closed, leaves the guest `%APPDATA%\Integral` tree in place, or the note records that the account gate created no such tree
- [ ] Actual Windows prompts, including SmartScreen if shown, are quoted for the evidence note

**Verification:**

- [ ] Manual check: guest install, shortcut launch, and closed-app reinstall
- [ ] Build succeeds: not this task
- [ ] Tests pass: not this task

**Dependencies:** Checkpoint after Tasks 1-3

**Files likely touched:** None in the repo during the guest run

**Estimated scope:** Small: 0 source files

## Task 5: Write the evidence note

**Description:** Write `docs/WINDOWS-DEVELOPMENT-INSTALLER-EVIDENCE.md` from the host build and the guest rehearsal. State each spec check as pass, fail, or not tested. Omit recovery-key bytes, account tokens, and SmartScreen click-through instructions.

**Acceptance criteria:**

- [ ] The note names version `0.1.2`, the exe path, and the VM or sandbox product
- [x] Signup, runtime download, offline restart, Authenticode, and public release are recorded as not tested
- [x] `install.ps1`, `desktop/accounts/config.json`, and `include_windows` are unchanged

**Verification:**

- [ ] Manual check: the note against spec success criteria 1–7
- [ ] Tests pass: `npm run verify` only if a source fix was separately approved
- [ ] Build succeeds: already covered by Task 3

**Dependencies:** Task 4

**Files likely touched:**

- `docs/WINDOWS-DEVELOPMENT-INSTALLER-EVIDENCE.md`

**Estimated scope:** Small: 1 file

## Checkpoint: Complete

- [ ] `docs/WINDOWS-DEVELOPMENT-INSTALLER-EVIDENCE.md` matches the spec
- [ ] No signed build, manifest publication, or workflow dispatch was run
- [ ] Ready for review
