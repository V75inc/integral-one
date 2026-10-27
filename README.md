# Integral | one

**Your workspace. On your computer.**

Integral One brings Apps, records and an AI coworker together in a personal desktop workspace. Organize work your way, use it without AI, or connect a local model or your preferred AI provider.

- **Local by default.** Your workspace files and records stay on your computer.
- **Works offline after setup.** Keep using your local workspace when the account service is unavailable.
- **One Integral account.** Simple signup today, with shared account identity planned for Integral Business.
- **Open source.** Apache-2.0, built on [Integral Core](https://github.com/V75inc/integral-core).

> **Release status:** [0.1.8 is available as a signed development preview](https://github.com/V75inc/integral-one/releases/tag/v0.1.8) for Apple Silicon Macs, with Core rc35 from TestPyPI. Installer, native update/automatic restart and real account checks passed. See [signed release qualification](docs/SIGNED-INSTALLER-QUALIFICATION-2026-10-26.md#published-018-development-preview).

## Get started

### One command for desktop users

The development preview is available now. No Git, Node or Python installation is required for this path. Initial runtime setup and account sign-in need internet.

**Apple Silicon Macs, macOS 14+** — paste into Terminal:

```sh
curl -fsSL https://github.com/V75inc/integral-one/releases/download/v0.1.8/install.sh | /bin/bash -s -- --channel development
```

The command selects the latest complete development release, verifies it, installs it for your OS account and opens Integral One. Complete signup in the app; first-run runtime setup is automatic. Apple security checks stay enabled. Quit Integral One before reinstalling.

Windows, Intel Mac and Linux installers are not included in this preview. See [platform readiness](docs/PLATFORM-READINESS.md). macOS 14 is the declared minimum; native release acceptance was performed on macOS 15.7.7 arm64.

Development builds use TestPyPI and GitHub prereleases. The [development one-line commands](docs/INSTALL.md#development-release-candidates) select that channel without bypassing publisher verification. Installed builds check their channel automatically and provide **Help → Check for Updates…**; downloading and restarting each require your approval.

See [installation and troubleshooting](docs/INSTALL.md), or download directly from [GitHub Releases](https://github.com/V75inc/integral-one/releases/tag/v0.1.8).

### For contributors

`npm run setup` builds a cloned source checkout; it is **not** the desktop-user installer. See [developer setup](docs/DEVELOPMENT.md) for Node/Python/uv prerequisites and public account configuration. An Integral account is not required to build or contribute to the Apache source.

## Make it yours

Create an App to group related work, add a Track, then create your first record. AI setup is optional. [Getting started](docs/GETTING-STARTED.md) walks through the essentials.

Files and records stay local. If you choose a hosted AI provider, the prompts and context needed for that request are sent to that provider. Account signup for this gate uses Logto at https://auth.saas.apps.trueselph.com/oidc; local files stay local, and this tenant’s user list includes dev signups. See [accounts and offline access](docs/GETTING-STARTED.md#accounts-and-offline-access).

## Help and contribute

- [Getting started](docs/GETTING-STARTED.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Report a problem](https://github.com/V75inc/integral-one/issues/new/choose) · [Security reporting](SECURITY.md)
- [Privacy](PRIVACY.md) · [Code signing policy](CODE_SIGNING.md)
- [Contribute](CONTRIBUTING.md) · [Developer setup](docs/DEVELOPMENT.md) · [Documentation](docs/README.md)

Integral One owns the desktop experience. Integral Core owns the shared platform, editor, graph and agent capabilities. Independent Apps can be open source or commercial; the future marketplace is not required to build an App. Integral Business remains private. Seamlessly upgrade to Integral Business when you scale is our intended direction; Business upgrade and data transfer are not available in this preview.

## License

[Apache-2.0](LICENSE). Existing attribution and third-party terms are preserved in [NOTICE](NOTICE) and [LICENSING.md](LICENSING.md). See [source provenance](docs/SOURCE-PROVENANCE.json) for the pinned development artifacts used by this preview.
