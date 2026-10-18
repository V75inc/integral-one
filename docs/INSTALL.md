# Install Integral One

**For desktop users. No Git, Node.js, Python or package manager required.**

The commands below are the prepared public installation path. **They are not live yet:** the first stable signed release, production signup configuration and bootstrap assets still need to be published. Until then, a missing-release message is expected; `npm run setup` is not the end-user installer.

## macOS — Apple Silicon or Intel

Open **Terminal**, paste this line and press Return:

```sh
curl -fsSL https://github.com/V75inc/integral-one/releases/latest/download/install.sh | /bin/bash
```

The installer detects your Mac, downloads the matching application, checks the release checksum and Apple publisher/notarization acceptance, installs into **Applications in your home folder**, then opens Integral One. It does not use sudo or alter macOS security settings. Quit a running Integral One before updating.

## Windows — x64 (later release)

Windows is prepared but will not be included in the initial macOS launch. Its trusted signing certificate and clean-machine qualification are still outstanding. This does not block the Mac installer.

Open **PowerShell** as your normal user, paste this line and press Enter:

```powershell
irm https://github.com/V75inc/integral-one/releases/latest/download/install.ps1 | iex
```

The installer downloads the Windows installer, checks its checksum and Authenticode publisher signature, installs for your Windows account, creates shortcuts and opens Integral One. It does not change execution policy, disable certificate validation or delete workspace data. Windows ARM64 and Linux are not yet qualified by this bootstrap.

## Finish in the app

Choose **Sign up** or **Sign in**, then complete email verification or your social provider's prompts. Everything else is prepared automatically. Initial runtime downloads need internet and may take a few minutes; no separate runtime installation or activation step is needed. Local work continues offline after setup.

Your files and records stay on your computer. Hosted AI requests send the necessary prompts/context to your selected provider. Account information goes to Clerk.

## Prefer a download button?

Use [GitHub Releases](https://github.com/V75inc/integral-one/releases) when the signed release is available. The terminal command executes the bootstrap from that same release channel; you may download and inspect `install.sh` or `install.ps1` before running it. No release asset should ask you to disable OS security protections.

Read [Privacy](../PRIVACY.md) and the [Code signing policy](../CODE_SIGNING.md).
SignPath Foundation signing is being investigated; no approval is claimed.

## If installation stops

- **No release available:** a stable public release has not been published, or GitHub cannot be reached. Retry later or check Releases.
- **Quit Integral One:** close the running app and repeat the command.
- **Checksum or signature failure:** stop and [report the problem](https://github.com/V75inc/integral-one/issues/new/choose). Nothing should require bypassing the check.
- **Existing installation needs recovery:** keep the data directory and contact a maintainer. Do not delete records or encryption keys to reinstall.

The bootstrap replaces application files only. It does not provide a workspace backup; keep a consistent backup before updates. See [getting started](GETTING-STARTED.md), [troubleshooting](TROUBLESHOOTING.md) and [data compatibility](DATA-COMPATIBILITY.md).
