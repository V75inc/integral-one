# Install Integral One

**For desktop users. No Git, Node.js, Python or package manager required.**

The signed and notarized [0.1.8 development preview](https://github.com/V75inc/integral-one/releases/tag/v0.1.8) is available for Apple Silicon Macs. It includes Core rc35 from TestPyPI and uses the development update channel. A stable/latest release and Windows installer are not available. `npm run setup` is the contributor setup command.

## macOS — Apple Silicon, macOS 14 or newer

Open **Terminal**, paste this line and press Return:

```sh
curl -fsSL https://github.com/V75inc/integral-one/releases/download/v0.1.8/install.sh | /bin/bash -s -- --channel development
```

Intel Macs are not supported by the current Core runtime. See [platform readiness](PLATFORM-READINESS.md).

The installer detects your Mac, selects the latest complete development release, downloads the matching application, checks the release checksum and Apple publisher/notarization acceptance, installs into **Applications in your home folder**, then opens Integral One. It does not use sudo or alter macOS security settings. Quit a running Integral One before updating. Initial runtime setup downloads managed Python automatically. Native acceptance was performed on macOS 15.7.7 arm64; macOS 14 is the declared support floor.

## Windows — x64 (later release)

Windows is prepared but will not be included in the initial macOS launch. Its trusted signing certificate and clean-machine qualification are still outstanding. This does not block the Mac installer.

Open **PowerShell** as your normal user, paste this line and press Enter:

```powershell
irm https://github.com/V75inc/integral-one/releases/latest/download/install.ps1 | iex
```

The installer downloads the Windows installer, checks its checksum and Authenticode publisher signature, installs for your Windows account, creates shortcuts and opens Integral One. It does not change execution policy, disable certificate validation or delete workspace data. Windows ARM64 and Linux are not yet qualified by this bootstrap.

## Finish in the app

Choose **Sign up** or **Sign in**, then complete email verification or your social provider's prompts. Everything else is prepared automatically. First-time setup needs internet and may take several minutes. The startup window shows download/setup progress, and reopening resumes completed downloads. No separate runtime installation or activation step is needed. Local work continues offline after setup.

Your files and records stay on your computer. Hosted AI requests send the necessary prompts/context to your selected provider. Account sign-in goes to the configured Logto service.

## Prefer a download button?

Download the [signed Apple Silicon ZIP](https://github.com/V75inc/integral-one/releases/download/v0.1.8/integral-one-0.1.8-mac-arm64.zip), extract it and move Integral One to your Applications folder, or use the command above. You may download and inspect `install.sh` before running it. No release asset should ask you to disable OS security protections.

Read [Privacy](../PRIVACY.md) and the [Code signing policy](../CODE_SIGNING.md).
SignPath Foundation signing is being investigated; no approval is claimed.

## If installation stops

- **No release available:** check the selected channel and your connection. This preview needs `--channel development`; a stable/latest release has not been published.
- **Quit Integral One:** close the running app and repeat the command.
- **Checksum or signature failure:** stop and [report the problem](https://github.com/V75inc/integral-one/issues/new/choose). Nothing should require bypassing the check.
- **Existing installation needs recovery:** keep the data directory and contact a maintainer. Do not delete records or encryption keys to reinstall.

The bootstrap replaces application files only. It does not provide a workspace backup; keep a consistent backup before updates. See [getting started](GETTING-STARTED.md), [troubleshooting](TROUBLESHOOTING.md) and [data compatibility](DATA-COMPATIBILITY.md).

## Development release candidates

Development installers follow TestPyPI Core releases and are published as GitHub prereleases. The published Mac bootstrap selects the latest complete candidate in that channel:

```sh
curl -fsSL https://github.com/V75inc/integral-one/releases/download/v0.1.8/install.sh | /bin/bash -s -- --channel development
```

The following Windows command is prepared for a future qualified Windows release; it cannot install the Mac-only 0.1.8 preview:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/V75inc/integral-one/main/install/install.ps1))) -Channel development
```

Use `--check` on macOS or `-Check` on Windows to inspect availability without downloading or installing an application. Both channels verify the installer's Core pin against the selected package index, then retain native publisher and checksum checks. A development channel does not bypass signing. The app checks that channel automatically and offers **Help → Check for Updates…** for a manual check. Download and restart each require your approval.
