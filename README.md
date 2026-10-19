# Integral | one

**Your workspace. On your computer.**

Integral One brings Apps, records and an AI coworker together in a personal desktop workspace. Organize work your way, use it without AI, or connect a local model or your preferred AI provider.

- **Local by default.** Your workspace files and records stay on your computer.
- **Works offline after setup.** Keep using your local workspace when the account service is unavailable.
- **One Integral account.** Simple signup today, with shared account identity planned for Integral Business.
- **Open source.** Apache-2.0, built on [Integral Core](https://github.com/V75inc/integral-core).

> **Release status:** development preview. Signed public installers are not available yet. The macOS development candidate has passed the [documented installation and local-use checks](docs/FIRST-RELEASE-QUALIFICATION.md); production account setup and release qualification remain open.

## Get started

### One command for desktop users

**Prepared for the first stable release; not live until signed release assets are published.** No Git, Node or Python installation is required for this path.

**macOS** — paste into Terminal:

```sh
curl -fsSL https://github.com/V75inc/integral-one/releases/latest/download/install.sh | /bin/bash
```

**Windows x64 — prepared for a later release**, pending Windows signing and qualification:

```powershell
irm https://github.com/V75inc/integral-one/releases/latest/download/install.ps1 | iex
```

The initial release targets macOS; a Windows certificate is not required to publish the Mac installers. The command downloads the matching signed release, verifies it, installs it for your OS account and opens Integral One. Complete signup in the app; first-run runtime setup is automatic. Apple/Windows security checks stay enabled. Linux and Windows ARM64 are not yet qualified.

See [installation and troubleshooting](docs/INSTALL.md), or download directly from [GitHub Releases](https://github.com/V75inc/integral-one/releases) when the signed release is available.

### For contributors

`npm run setup` builds a cloned source checkout; it is **not** the desktop-user installer. See [developer setup](docs/DEVELOPMENT.md) for Node/Python/uv prerequisites and public account configuration. An Integral account is not required to build or contribute to the Apache source.

## Make it yours

Create an App to group related work, add a Track, then create your first record. AI setup is optional. [Getting started](docs/GETTING-STARTED.md) walks through the essentials.

Files and records stay local. If you choose a hosted AI provider, the prompts and context needed for that request are sent to that provider. Account signup sends account information to Clerk. See [accounts and offline access](docs/GETTING-STARTED.md#accounts-and-offline-access).

## Help and contribute

- [Getting started](docs/GETTING-STARTED.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Report a problem](https://github.com/V75inc/integral-one/issues/new/choose) · [Security reporting](SECURITY.md)
- [Privacy](PRIVACY.md) · [Code signing policy](CODE_SIGNING.md)
- [Contribute](CONTRIBUTING.md) · [Developer setup](docs/DEVELOPMENT.md) · [Documentation](docs/README.md)

Integral One owns the desktop experience. Integral Core owns the shared platform, editor, graph and agent capabilities. Independent Apps can be open source or commercial; the future marketplace is not required to build an App. Integral Business remains private. Seamlessly upgrade to Integral Business when you scale is our intended direction; Business upgrade and data transfer are not available in this preview.

## License

[Apache-2.0](LICENSE). Existing attribution and third-party terms are preserved in [NOTICE](NOTICE) and [LICENSING.md](LICENSING.md). See [source provenance](docs/SOURCE-PROVENANCE.json) for the pinned development artifacts used by this preview.
