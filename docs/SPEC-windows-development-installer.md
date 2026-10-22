# Spec: Windows development installer rehearsal

## Objective

Prove that the Windows x64 NSIS installer already in this repo can be built unsigned on this PC and installed by a normal user inside a Windows VM or sandbox on this same PC. The user is a maintainer rehearsing the same direct-download shape the Mac app uses. Success is a dated evidence note of the actual Windows prompts, shortcuts, and first open. It is not a public download, a signed manifest, or a production signup.

This spec is rung one from [windows installer idea](ideas/windows-installer.md). Rung two (a publisher, Authenticode, `include_windows`, and a public Windows asset) stays closed. [Windows signing](WINDOWS-SIGNING.md) and [installer release](INSTALLER-RELEASE.md) are constraints on this rehearsal, not extra work.

### Assumptions

1. Rung one is the only capability in scope. Signer choice, SignPath, a paid V75 Inc. certificate, production account configuration, and GitHub publication are later owner decisions.
2. This Windows x64 PC is the build machine. The install runs inside a Windows VM or sandbox on this PC. That guest is the disposable profile: the Mac development check used a fresh task-owned home and Electron profile, and a per-user NSIS install has no `--home` or `--user-data-dir` switch, so the guest takes that role. The host's personal `Integral` directory stays untouched. The later signed-release clean-machine walkthrough in [Windows signing](WINDOWS-SIGNING.md) remains a separate gate.
3. Toolchain for the host build: Node.js 24, `PYTHON` = `C:\Program Files\Python312\python.exe`, and uv 0.13.4 via `INTEGRAL_UV_BINARY`. The PATH `python` 3.13 and PATH uv 0.12.6 stay in place. The guest needs neither Node, Python, nor uv.
4. Account behavior matches a Mac development installer. The checked-in `desktop/accounts/config.json` stays unconfigured (`configured: false`). The installed app is expected to open the Integral Account window. It is not expected to finish signup or start the Core runtime. `startCore` runs only after that account gate resolves, and activation throws when the account service is not configured. The 18 October Mac qualification that completed development signup used a separate Clerk development configuration. The 21 October packaged Mac signup used `desktop/accounts/config.production.json`. This rung follows the unconfigured development installer.
5. The installer is launched by running `release\integral-one-0.1.2-win-x64.exe` directly. `install.ps1` stays pointed at a future signed release and is not used to install this exe.
6. Product source changes only if this rehearsal hits a defect. The expected deliverable is evidence, not a feature change.
7. Current source versions match: `package.json` `0.1.2` and `distribution.json` `product_version` `0.1.2`. The artifact name follows `integral-one-${version}-win-${arch}.${ext}`.

## Tech Stack

- Electron 44.9.0 and electron-builder 26.15.3, NSIS target, already declared in `package.json`.
- Node.js 24 (setup rejects any other major).
- Python 3.12 for wheel composition. The packaged runtime also asks uv for Python 3.12, which is a later launch concern.
- uv 0.13.4, the version `scripts/bundle-runtime.js` accepts.
- Windows x64. No Microsoft Store, MSIX, Linux, or Windows ARM64.

NSIS settings already in `package.json`: `oneClick: true`, `perMachine: false`, `allowElevation: false`, `runAfterFinish: false`, `deleteAppDataOnUninstall: false`, desktop and Start menu shortcuts. App ID `ai.integral.desktop`. User-data directory name `Integral` (`%APPDATA%\Integral` once Electron creates it).

## Commands

Build on this PC, from the repo root, in PowerShell. Do not pass `--signed`. Do not set `ONE_WINDOWS_CERT_SHA1`, `CSC_LINK`, or `INTEGRAL_ACCOUNT_CONFIG`.

```powershell
node -v
& $env:PYTHON -c "import sys; print(sys.version)"
& $env:INTEGRAL_UV_BINARY --version
npm run setup
npm run build:installers
```

Required environment for that session:

```powershell
$env:PYTHON = 'C:\Program Files\Python312\python.exe'
$env:INTEGRAL_UV_BINARY = '<task-owned path>\uv.exe'
```

`node -v` must print a `v24` release. `PYTHON` must report 3.12. `INTEGRAL_UV_BINARY --version` must match `uv 0.13.4`. `npm run build:installers` must finish with `Development installer built. It cannot pass the public bootstrap signature/release gates.` and leave:

```text
release\integral-one-0.1.2-win-x64.exe
```

`build:installers` already runs `node scripts/inspect-package.js`. On Windows without `--signed` it passes `--config.win.signExecutable=false`.

Copy `release\integral-one-0.1.2-win-x64.exe` into the Windows VM or sandbox. Run it there as a normal user, with the app not already running. Do not run it on the host profile.

```powershell
& '<path-inside-guest>\integral-one-0.1.2-win-x64.exe'
```

Then open Integral One from the shortcut the installer created. Quit. Run the same exe again with the app closed.

If any source file changes because a defect blocked the build or install:

```powershell
npm run verify
```

Do not run `npm run build:installers -- --signed`, `npm run release:manifest`, or a workflow dispatch with `include_windows` true.

## Project Structure

| Path | Role in this rehearsal |
| --- | --- |
| `scripts/build-installers.js` | Unsigned Windows build entry. Already refuses a signed Windows release. |
| `scripts/bundle-runtime.js` | Rejects any uv other than 0.13.4. |
| `scripts/setup.js` | Requires Node 24 and Python 3.11+. |
| `package.json` `build.nsis` | Per-user installer, shortcuts, data kept on uninstall. |
| `desktop/accounts/config.json` | Unconfigured public account file used by this build, same as a Mac development installer. Leave it. |
| `desktop/accounts/config.production.json` | Public production candidate. Leave it out of this build. |
| `install/install.ps1` | Signed-release bootstrap. Do not retarget it at this exe. |
| `release/` | Generated installer output. Gitignored. |
| `docs/WINDOWS-DEVELOPMENT-INSTALLER-EVIDENCE.md` | Evidence note this rehearsal writes. Not a public install guide. |
| `.github/workflows/installer-candidate.yml` | `include_windows` stays false. |
| `docs/WINDOWS-SIGNING.md`, `docs/INSTALLER-RELEASE.md` | Later signed-release rules. Unchanged by this rung. |

## Code Style

No new module is planned. A defect fix uses the existing fail-closed script style: `'use strict'`, throw on a bad platform or flag, and do not add a bypass.

```javascript
if (signed) {
  if (process.platform === 'win32') throw new Error('Windows signed release remains blocked until its signing and automatic-update path are qualified. The initial signed release targets macOS.');
}
if (!signed && process.platform === 'win32') args.push('--config.win.signExecutable=false');
```

Names stay as they are: `ai.integral.desktop`, user-data name `Integral`, artifact `integral-one-<version>-win-x64.exe`. Do not add an unsigned-install override to `install.ps1`.

## Testing Strategy

This rung is a manual installation on Windows. Automated coverage already guards the signed-release refusal; do not weaken those tests to make an unsigned file look publishable.

| Check | How |
| --- | --- |
| Unsigned build completes and package inspection passes | `npm run build:installers` exit and its closing log line |
| Per-user install, shortcuts, account window | Install inside the VM or sandbox and record the prompts in the evidence note |
| Reinstall keeps existing local data | Second install inside the guest with the app closed; compare that guest's `%APPDATA%\Integral` tree |
| Signed Windows build still refuses | Do not flip the switch. Existing `scripts/build-installers.js` throw remains |
| Source change, if one is required | `npm run verify` |

There is no unit test that clicks through SmartScreen. The evidence note is the record. It quotes OS prompt text and states pass, fail, or not tested. It does not include recovery-key bytes, account tokens, or instructions to bypass SmartScreen.

Runtime download, offline restart, signup, and recovery-key stability stay **not tested**, matching an unconfigured Mac development installer. The evidence note lists them that way. The host `%APPDATA%\Integral` directory is not an install target.

## Boundaries

- Always: Use Node 24, Python 3.12 via `PYTHON`, and uv 0.13.4 via `INTEGRAL_UV_BINARY` on the host. Build with `npm run build:installers` and no `--signed`. Install only inside the Windows VM or sandbox. Record the prompts that guest actually shows, and name the VM or sandbox product in the evidence note. Keep app ID `ai.integral.desktop` and the `Integral` data-directory name. Keep Apache LICENSE and NOTICE in the package. Run `npm run verify` before any commit that includes a source fix.
- Ask first: Any product or script change. Installing Node, Python, or uv in a way that replaces the machine defaults. Dispatching `.github/workflows/windows-development.yml` or the signed installer workflow.
- Never: `build:installers --signed`, `include_windows` true, `npm run release:manifest` for publication, setting `INTEGRAL_ACCOUNT_CONFIG` to `desktop/accounts/config.production.json` for this rung, SignPath submission, certificate purchase, exporting a signing key, populating `WINDOWS_CSC_LINK`, a public GitHub release, an unsigned override in `install.ps1`, SmartScreen click-through instructions, installing on the host profile, committing secrets, or changing the Mac release path. Do not edit `vendor/`.

## Success Criteria

1. `npm run setup` and `npm run build:installers` complete on this PC with the toolchain above, and `release\integral-one-0.1.2-win-x64.exe` exists.
2. The build log states that the development installer cannot pass the public bootstrap signature and release gates. The command was not `--signed`.
3. Running that exe inside the VM or sandbox installs without accepting an administrator elevation prompt. The evidence note quotes the Windows security prompts, including SmartScreen if it appears.
4. A desktop shortcut and a Start menu shortcut for Integral One exist inside the guest. Opening the shortcut shows the Integral Account window. The note records the actual install directory.
5. With the app closed, running the exe again does not remove the guest `%APPDATA%\Integral` tree that the first launch created. If that tree does not exist because the account gate never finished, the note says so and does not invent recovery keys.
6. `docs/WINDOWS-DEVELOPMENT-INSTALLER-EVIDENCE.md` records the candidate version `0.1.2`, the exe path, the VM or sandbox product, each check as pass, fail, or not tested, and states that signup, runtime download, offline restart, Authenticode, and public release were not qualified.
7. `include_windows` is still off, `install.ps1` is unchanged, the checked-in account file is still unconfigured, and no release was published.

## Resolved decisions

1. The install target is a Windows VM or sandbox on this PC. A second Windows user on the host is unnecessary.
2. Signup and the online-then-offline runtime check stay out of this rung, matching an unconfigured Mac development installer. No separate account-config file is required.
