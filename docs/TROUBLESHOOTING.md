# Troubleshooting

## Source setup stops

Run `npm run setup -- --check` to check Node, Python, uv and public account configuration without installing or building anything.

- Use **Node.js 24 LTS**. If you use nvm, run `nvm use` in the repository.
- Make Python 3.11+ available as `python3` (Windows: `python`), or set `PYTHON` to its executable path.
- Install uv and put it on PATH, or set `INTEGRAL_UV_BINARY` to its executable path.
- Check your internet connection and available disk space. Dependency and initial runtime downloads are required.
- After correcting the reported problem, run `npm run setup` again. It rebuilds generated assets; it does not reset your workspace.

## Signup says it is unavailable

The checked-in account configuration is intentionally unconfigured. Ask the maintainer for the build's **public** configuration, set `INTEGRAL_ACCOUNT_CONFIG`, then rebuild using `npm run setup`. Never put a Clerk secret key or receipt-signing private key in the desktop project.

For an already configured build, check your internet connection and try again. An existing configured workspace can still be opened offline.

## Google or Microsoft stays on Loading

Check Integral One: the desktop may already have completed sign-in even if the external browser tab still says Loading. If One is still waiting, choose **Restart sign-in** in the account window and try again. This restarts the account flow and preserves local records.

Do not create another account to recover an existing workspace. Use the account originally linked to that installation.

## First launch takes time

The first launch prepares the local runtime and downloads dependencies. Later launches reuse the runtime cache. Keep internet available until initial setup completes. If startup reports an error, retain the exact message and installation logs; do not delete the data directory to retry.

## I signed out

Choose **Sign in** to return through Clerk, or **Continue offline** to resume the existing local workspace. Offline access is deliberate. Sign-out is not a shared-computer security boundary.

## Updating or recovering an installation

Keep a consistent backup before updating. Preserve the existing `Integral` user-data directory, local installation ID, encryption keys and `one-account` state. Do not rename or merge data directories by hand. A restored Core backup requires a reviewed recovery step before it can serve data; see [data compatibility](DATA-COMPATIBILITY.md).

Unsigned development packages are not public installers. Do not bypass operating-system security warnings as an installation procedure; public macOS releases still need signing/notarization qualification.

## Report a problem

[Open a bug report](https://github.com/V75inc/integral-one/issues/new/choose) with your OS/architecture, One version, exact steps and the error message. Remove emails, tokens, provider keys and record contents from screenshots and logs. Report security issues through [SECURITY.md](../SECURITY.md).
