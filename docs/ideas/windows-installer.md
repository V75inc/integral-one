# Windows installer, on the Mac release path

## Problem Statement

How might we make a Windows x64 build of Integral One installable from the same direct-download pipeline the Mac app already uses, without a store listing and without handing anyone an unsigned public installer?

## Recommended Direction

Use the installer that is already in the repo. Integral One for Mac is not a store app. It is an electron-builder archive, signed by the V75 Inc. Developer ID, checked by `install.sh`, and published only after a separate release decision. Windows already has the matching pieces: an electron-builder NSIS package, `install.ps1`, and a manifest entry that records a publisher thumbprint. The Apple certificate cannot sign a Windows executable. The parallel to Developer ID plus notarization is a Windows Authenticode signature on `integral-one-<version>-win-x64.exe` and on the installed `Integral One.exe`.

Do this in two rungs. Rung one, on this Windows PC, builds the unsigned development installer with `npm run build:installers` and proves that a normal user can install it. That command already turns signing off on Windows. Rung two stays closed until an owner chooses the signer the Mac path already assumes exists: SignPath Foundation, if accepted, or a paid certificate whose publisher is V75 Inc. The signed command and the `include_windows` release switch both refuse to run today, and they should keep refusing until that signer exists and a Windows update has been qualified the way the Apple Silicon updater has to be qualified.

The checked-in account file is not configured. An installer built from it can open the app. It cannot complete production signup. That is the same rule as a Mac development build.

## Key Assumptions to Validate

- [ ] The unsigned NSIS package installs per user, creates shortcuts, and opens Integral One on this PC — build with Python 3.12 and uv 0.13.4, run `release/integral-one-0.1.2-win-x64.exe`, and record the Windows prompts
- [ ] Reinstalling with the app closed leaves the `Integral` data directory, app ID `ai.integral.desktop`, and recovery keys in place — install twice on a task-owned profile, not over a personal workspace
- [ ] An owner will choose SignPath or a paid V75 Inc. certificate before any public Windows download — the choice is a blocker for rung two, and no certificate is configured now
- [ ] The first-launch runtime download works from the installed app on Windows x64 — open the installed build once with network, then again offline

## MVP Scope

Rung one is the whole current scope.

- Point `PYTHON` at `C:\Program Files\Python312\python.exe`. The `python` on PATH is 3.13, and the runtime is qualified on 3.12.
- Use uv 0.13.4. The installed uv is 0.12.6, and `scripts/bundle-runtime.js` rejects anything else. Keep 0.13.4 beside it via `INTEGRAL_UV_BINARY` rather than replacing the global tool.
- Run `npm run setup`, then `npm run build:installers`. Do not pass `--signed`.
- Install the resulting exe as a normal user and write down what Windows shows, whether shortcuts appear, and whether the app opens.
- Leave `include_windows` off. Leave `install.ps1` pointed at a future signed release. It checks an Authenticode thumbprint and will reject this exe.

Out of this rung: production signup, a public GitHub release, and a signed manifest.

## Not Doing (and Why)

- **Microsoft Store or MSIX** — the Store re-signs a package it hosts. It does not sign the NSIS exe, and it replaces the direct-download channel the Mac app uses.
- **A public unsigned download** — `install.ps1` has no unsigned override, and users should not be told to click through SmartScreen.
- **Reusing the Apple Developer ID** — it signs the Mac ZIP only. Windows needs its own publisher.
- **Turning on `include_windows` or `build:installers --signed`** — both are hard-stopped until a Windows signer and the Windows updater are qualified. Flipping the switch fails the build.
- **Submitting the SignPath application or buying a certificate** — owner decisions. The prepared notes in `docs/SIGNPATH-APPLICATION.md` and `docs/WINDOWS-SIGNING.md` stay the handoff.
- **Changing the Mac release** — Windows trails Apple Silicon. A missing Windows certificate does not block the Mac installer.
- **Linux and Windows ARM64** — the bootstrap does not claim them.

## Open Questions

- Who chooses SignPath versus a paid V75 Inc. certificate, and when?
- Which public account config should a later signed build embed? The checkout config has `"configured": false`.
- Is this development PC an acceptable install rehearsal, or does rung one also need a clean Windows x64 machine before the notes count as qualification?
