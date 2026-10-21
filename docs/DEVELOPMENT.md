# Build Integral One

Integral One composes pinned Integral Core artifacts with desktop branding, onboarding and account integration. Work on the generic engine, editor or agent belongs in Core; do not patch `vendor/` in place.

## Prerequisites

- Node.js **24 LTS** and npm; `.nvmrc` selects 24 for nvm users.
- Python **3.11+** for wheel composition. Set `PYTHON` if the executable is not `python3` (Windows: `python`).
- [uv](https://docs.astral.sh/uv/getting-started/installation/) **0.13.4** on PATH, or `INTEGRAL_UV_BINARY` pointing to that reviewed executable for your platform. CI and runtime bundling pin this patched version; its MIT notice ships in the application.
- Internet, build-tool disk space and a supported desktop OS. The current live native qualification is macOS arm64; Windows/Linux remain release gates.

The packaged Core runtime selects Python 3.12 through uv. Installing Python for source composition does not eliminate first-run runtime downloads.

UI composition generates a local Vite setting pointing public-page discovery at
an empty One-owned directory. Default previews do not discover neighboring private
Business App pages. The generated configuration is ignored and contains no keys.

## One-command setup

Clone the repository and open a terminal in its directory:

```sh
npm run setup
```

Setup checks prerequisites and public account configuration, runs the locked dependency install, composes/builds the workspace UI, prepares the local runtime and bundles the account UI. It does not publish, sign or deploy anything, or change your data paths. Build output is ignored by Git.

```sh
npm start
```

To build and launch in one command, use `npm run setup -- --launch`. To check prerequisites without installing or building, use `npm run setup -- --check`.

### Account configuration

The checked-in `desktop/accounts/config.json` is unconfigured. This permits source builds without distributing a maintainer's keys or implying a live production service. A fresh official account flow needs a maintainer-provided **public JSON configuration**. Existing local recovery is handled separately by the account controller.

Set `INTEGRAL_ACCOUNT_CONFIG` to that JSON file before setup. For example, on macOS/Linux:

```sh
INTEGRAL_ACCOUNT_CONFIG=/absolute/path/public-account-config.json npm run setup
```

In PowerShell:

```powershell
$env:INTEGRAL_ACCOUNT_CONFIG = 'C:\absolute\path\public-account-config.json'
npm run setup
```

Keep the variable set when running `npm start` or packaging: those commands rebuild account assets. It contains only the publishable key, exact issuer/service origins, environment and named public verification keys accepted by `desktop/accounts/config.js`. Never put a Clerk secret key or signing private key in One. Account configuration is a maintainer task, not an installer user's setup step.

The current implementation uses a small registration service for signed offline receipts. Clerk-only signup/user counting is under review as a launch simplification; see the [production walkthrough](CLERK-CLOUDFLARE-SETUP.md). Do not remove the existing receipt verification or pretend production signup works before the replacement is implemented and qualified.

### Isolate development data

For native runtime work, use a fresh task-owned Core home and Electron profile. For example on macOS/Linux:

```sh
npm start -- --home=/tmp/integral-one-dev-home --user-data-dir=/tmp/integral-one-dev-profile
```

Do not use an existing personal workspace for disposable checks. The app ID `ai.integral.desktop` and default `Integral` data directory are compatibility identities; preserve them.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run setup` | Install dependencies and build the source checkout |
| `npm start` | Rebuild account assets and open the desktop |
| `npm run qualify:ui` | Recompose the pinned Core UI, clean-install its dependencies and build it |
| `npm run build:runtime` | Compose the branded wheel and bundle its platform uv launcher |
| `npm run build:accounts` | Build the account UI/preload and validate public configuration |
| `npm run verify` | Check distribution integrity and run One's contract/composition tests |
| `npm run test:ui` | Run the composed frontend suite |
| `npm run build:installers` | Build a development native ZIP/NSIS installer on the matching native host |
| `npm run pack` | Rebuild account/runtime assets, run One verification and create an unsigned directory bundle |
| `node scripts/inspect-package.js` | Inspect one current directory bundle for required assets, integrity and notices |

`qualify:ui` replaces `.build/frontend`, including its installed dependencies. Run it before `build:runtime`. Dependency/runtime preparation may download Python, database runtime components and packages. A successful source build is not a signed-installer or production-account qualification.

For a local unsigned macOS bundle, disable signing discovery explicitly:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
```

On PowerShell, set `$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'` before `npm run pack`. Actual release signing and publication are separate maintainer operations.

## Source layout

| Path | Responsibility |
| --- | --- |
| `accounts/` | One signup/sign-in UI and appearance |
| `desktop/` | Native entry point, account controller, icons and loader |
| `frontend/host/` | One branding overlay over the Core UI |
| `scripts/` | Setup, composition, build and integrity checks |
| `vendor/` | Immutable pinned Core source/wheel/host artifacts with provenance |
| `docs/` | User guides, contributor instructions and release evidence |
| `.build/`, `resources/`, `release/` | Generated, ignored output |

Update dependencies through their upstream source and regenerate pins/manifests. Preserve LICENSE, NOTICE and component exceptions. See [contributing](../CONTRIBUTING.md), [source provenance](SOURCE-PROVENANCE.json) and [release gates](RELEASE-GATES.md).

## End-user release

Source setup is separate from the [one-command installer](INSTALL.md). See [installer release](INSTALLER-RELEASE.md) for production account/signing inputs, native architecture jobs and verified release manifests.


### Shared desktop host

The reusable Apache host source and tests are maintained here in
`packages/desktop-host`. Run `npm run test:host` after changes. Preserve its
LICENSE/NOTICE and stable runtime/session contracts. Pack a reviewed version into
`vendor/`, update the distribution hash and npm lockfile, and qualify consumers.
Business can consume the host without importing One's account UI. Core's legacy
Electron product is retired in the runtime-composition candidate; its neutral
local/hosted engine contracts and storage/recovery remain supported.

After `npm run build:runtime`, `npm run qualify:runtime` boots the pinned engine
in a new temporary installation, checks its running local contract and controller
session, then stops/removes that synthetic home. It does not open signup or use
your existing workspace. Initial runtime provisioning can download dependencies.
PR CI runs this check on each native runner before packaging.
