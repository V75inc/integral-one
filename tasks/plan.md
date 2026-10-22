# Implementation Plan: Windows development installer rehearsal

## Overview

Build the unsigned Windows x64 NSIS installer on this PC with the approved toolchain, then hand `release\integral-one-0.1.2-win-x64.exe` to a Windows VM or sandbox for a per-user install and a closed-app reinstall. The deliverable is `docs/WINDOWS-DEVELOPMENT-INSTALLER-EVIDENCE.md`. No product change is planned. Spec: `docs/SPEC-windows-development-installer.md`.

Tasks are in `tasks/todo.md`.

## Architecture Decisions

- The host builds. The guest installs. The host `%APPDATA%\Integral` directory is not an install target.
- Session environment for the build:
  - `PYTHON` = `C:\Program Files\Python312\python.exe` (already 3.12.10)
  - `INTEGRAL_UV_BINARY` = `C:\v75\integral-one\.local\uv-0.13.4\uv.exe` (already `uv 0.13.4`)
  - Node is already `v24.13.1`
- PATH uv `0.12.6` at `C:\Users\jason\miniconda3\Scripts\uv.exe` stays the global tool. `resources\core\uv.exe` is also 0.13.4, and it is not the build input: `build:runtime` clears `resources/core` before copying the launcher.
- `INTEGRAL_ACCOUNT_CONFIG`, `ONE_WINDOWS_CERT_SHA1`, `CSC_LINK`, and `CSC_KEY_PASSWORD` are unset. The build uses the checked-in unconfigured account file and `npm run build:installers` with no `--signed`.
- A source change happens only after this plan stops on a defect and a human approves the fix. `npm run verify` runs before any commit of that fix.
- The guest install is a human step. This session does not start a VM, accept an elevation prompt, or click through SmartScreen.

## Dependency Graph

```text
Host toolchain session
    └── npm run setup
            └── npm run build:installers
                    └── Checkpoint: exe exists, host profile untouched
                            └── Human installs and reinstalls inside the VM or sandbox
                                    └── Evidence note
```

Nothing in this graph can run in parallel. The evidence note is last because it records the guest prompts.

## Task List

### Phase 1: Host build

- [x] Task 1: Confirm the host toolchain session
- [x] Task 2: Run `npm run setup`
- [x] Task 3: Run `npm run build:installers`

### Checkpoint: Installer artifact

- [x] `release\integral-one-0.1.2-win-x64.exe` exists
- [x] The build log says the development installer cannot pass the public bootstrap gates
- [x] Host `%APPDATA%\Integral` was not created or modified by the build
- [x] Human takes the exe into the VM or sandbox before any install

### Phase 2: Guest rehearsal

- [ ] Task 4: Install and reinstall inside the VM or sandbox
- [ ] Task 5: Write the evidence note

### Checkpoint: Complete

- [ ] Evidence note matches the spec success criteria
- [x] `include_windows` is off, `install.ps1` and `desktop/accounts/config.json` are unchanged, and no release was published

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Setup or the installer build fails | High | Stop. Record the command and error. Ask before changing product source. |
| SmartScreen or another prompt blocks the guest install | Medium | Quote the prompt in the evidence note. Do not add a bypass or publish click-through steps. Criteria 3–5 fail if the install cannot finish. |
| The exe is launched on the host profile | High | Copy it into the guest and run it there. The host install is out of bounds. |
| Signing or production account variables get picked up | High | Confirmed unset before planning. The build session sets only `PYTHON` and `INTEGRAL_UV_BINARY`. |
| `resources/core/uv.exe` is used as the uv input | Medium | Use `.local\uv-0.13.4\uv.exe`. The runtime bundle deletes `resources/core` first. |
| Guest is not ready when the exe exists | Low | Stop at the artifact checkpoint and wait for the guest run. |

## Open Questions

None. The VM or sandbox product name is recorded when the guest install happens.
