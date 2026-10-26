# Implementation Plan: Logto account gate

Spec: `docs/SPEC-logto-account-gate.md`

Direction: `docs/ideas/logto-account-gate.md`

Tasks: `tasks/todo.md`

Status: waiting for approval. Implementation has not started.

## Overview

Replace the Clerk desktop account gate with a Logto native sign-in. The person signs up or signs in once in the system browser. The Electron main process checks a fresh ES384 ID token from `https://auth.saas.apps.trueselph.com/oidc`, requires a verified email, and writes a version 3 local setup bound to that issuer and the Logto subject. Later launches stay offline. A different account cannot replace the link. No token is stored. The workspace stays on local data.

## Architecture Decisions

- The proof check lives in `desktop/accounts/logto-setup.js` and uses Node `crypto` and `fetch`. There is no Logto SDK and no JWT library. The three URLs are pinned beside the check: `https://auth.saas.apps.trueselph.com/oidc/auth`, `/token`, and `/jwks`. A discovery document cannot retarget them.
- ES384 is ECDSA P-384 with SHA-384. JWS carries the signature as raw R||S, so verification uses Node `dsaEncoding: "ieee-p1363"`. Tests sign fixtures the same way. A DER signature is not a valid fixture.
- The renderer never receives the authorization code, the PKCE verifier, or the ID token. `integral-one:account-start` takes no arguments. The main process builds the browser URL and calls `shell.openExternal`. Access tokens and refresh tokens from the token response are discarded.
- One in-memory attempt holds the verifier, `state`, and `nonce`. Restart replaces that attempt. A callback whose `state` does not match does not call the token endpoint and does not drop the outstanding attempt. A matching callback is single-use: it is consumed before the token POST. A second use, a missing code, an error parameter, or a callback with no attempt does not call the token endpoint.
- The OS callback is `integral-one://account/callback`. macOS arrives on `open-url`. Windows arrives on the first instance’s `second-instance` command line. The controller registers those listeners and `setAsDefaultProtocolClient` for `integral-one`. The desktop host is not edited. Its existing `second-instance` listener still only focuses the window. A callback already on the command line at launch, with no attempt in memory, does not exchange a code.
- The account partition’s `integral-one` handler keeps serving the allowlisted local assets. `/callback` is not a page. The query string is not given to the renderer.
- The local record stays on `one-account/activation.json`, signed by the per-installation Ed25519 key in `one-account/setup-key.json`. Version 3 carries `issuer`, `sub`, `installation_id`, `completed_at`, and `profile`. It has no `exp`, token, or session id. `readState`, `loadState`, `privateFile`, and `ID` from `receipt.js` remain the file helpers. The gate does not call `verifyReceipt` or `saveReceipt`, and it does not POST to a registration service.
- A stored Clerk version 2 payload or a legacy receipt is not a Logto setup and is not overwritten. Recovery can open that workspace for this process and writes no Logto binding. `clerk-setup.js` stays in the tree so `scripts/qualify-upgrade.js` and `scripts/inspect-package.js` keep their current module. It is not the live gate.
- Public config is contract version 3, provider `logto`, setup mode `logto`, and the pinned issuer. `environment` does not select a tenant. Updates stay off unless the existing production flag is also on. The checked-in `config.json` and `config.production.json` are unconfigured and have an empty `appId`. A real App ID is supplied only through `INTEGRAL_ACCOUNT_CONFIG` outside the repo. `config.runtime.json` stays generated and gitignored.
- The account page is one local column in the existing 360×560 window. It offers one browser action, the handoff, restart, Continue offline, and recovery. It does not draw email, Google, or Microsoft forms. The content security policy allows only the page’s own assets.
- User-facing signup copy changes only in the account window, the accounts section of `docs/GETTING-STARTED.md`, the signup paragraphs of `PRIVACY.md`, and the account sentence in `README.md`.

## Dependency Graph

```text
ES384 check, PKCE exchange, and version 3 record
    └── Public Logto config
            └── Unconfigured production file
                    └── Controller: browser, OS callback, offline, recovery
                            └── Account page and sandboxed preload
                                    ├── Main process stops constructing the Clerk bridge
                                    └── Signup copy in the three docs
```

The page depends on the controller’s IPC. The package removal waits until `desktop/main.js`, the preload, and the renderer no longer import `@clerk/electron`. The docs can be written alongside that removal.

## Task List

### Phase 1: Proof and config

- [ ] Task 1: ES384 check and version 3 record
- [ ] Task 2: Public Logto config
- [ ] Task 3: Unconfigured production file

### Checkpoint: Proof and config

- [ ] `npm test` passes
- [ ] The checked-in configs load unconfigured and contain no App ID and no secret
- [ ] Review with human before the controller cutover

### Phase 2: Gate

- [ ] Task 4: Browser handoff, callback, offline, and recovery
- [ ] Task 5: Local account page and preload

### Checkpoint: Gate

- [ ] `npm test` passes
- [ ] `npm run build:accounts` succeeds
- [ ] The account source no longer imports Clerk or Logto
- [ ] Review with human before removing the package

### Phase 3: Package and copy

- [ ] Task 6: Stop the Clerk bridge
- [ ] Task 7: Signup copy

### Checkpoint: Complete

- [ ] `npm run verify` passes
- [ ] `@clerk/electron` is not a dependency and is not imported by the live gate
- [ ] Manual checks below are done once a maintainer config supplies the public App ID
- [ ] Ready for review

## What stays put

- `vendor/`, Integral Core, and `packages/desktop-host`
- App id `ai.integral.desktop`, user-data name `Integral`, and the `one-account` paths
- Account window size, title `Integral Account`, background `#171717`, and the Windows caption overlay
- Sandbox, context isolation, the account partition, and navigation confined to `integral-one://account/` assets
- `desktop/accounts/clerk-setup.js`, `desktop/accounts/receipt.js`, `scripts/qualify-upgrade.js`, `scripts/inspect-package.js`, and `scripts/configure-clerk-origin.py`
- The `integral-one` protocol scheme already declared for packaged builds

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A real Logto ES384 JWT uses raw R\|\|S, while Node’s ECDSA default is DER | High | Verify and sign fixtures with `dsaEncoding: "ieee-p1363"`. |
| The host’s `second-instance` listener does not read the callback URL | High | The controller adds its own listener and does not edit the host. The host listener still focuses the window. |
| Electron also delivers the deep link to the account asset handler | Medium | `/callback` stays off the asset allowlist. The exchange runs only from the OS listeners. |
| A Clerk version 2 record currently skips the account window | High | Version 3 is the only offline setup. Version 2 and legacy receipts stay on disk and use recovery. `qualify-upgrade.js` still checks its own version 2 fixture through `clerk-setup.js`. |
| Configured Clerk UI and the Logto controller overlap between Tasks 4 and 5 | Medium | Treat a configured launch as ready only after the Task 5 checkpoint. |
| `config.production.json` still carries the Clerk publishable key | High | Task 3 replaces that file with the unconfigured Logto shape and an empty `appId`. |
| Removing `@clerk/electron` while an import remains | High | Task 6 follows the page and preload. `tests/clerk-sdk.test.js` leaves with the package. |
| `npm test` is treated as proof of OS protocol registration | High | Tests stub the main-process listener. Packaged Windows and macOS callback delivery stays the idea’s qualification. |
| A client secret or App ID is written into a tracked file | High | Unknown fields are rejected. The App ID stays in the maintainer config named by `INTEGRAL_ACCOUNT_CONFIG`. |

## Manual check

Run this only after Tasks 1–7, with a maintainer public config outside the repo. Use a task-owned home and profile. Do not point it at an existing Integral installation. Do not run `npm run build:installers`, a signed package, or a release workflow.

```powershell
$env:INTEGRAL_ACCOUNT_CONFIG = "<maintainer public config>"
npm start -- --home=$env:TEMP\integral-one-logto-home --user-data-dir=$env:TEMP\integral-one-logto-profile
```

- Unconfigured start, without that variable, shows the preview message and does not open a browser.
- Configured start opens the system browser. Email, Google, and Microsoft can each finish, including email delivery, and the app then opens the workspace.
- The account window never shows the Logto page. After the app opens, the person can close the browser tab.
- A second launch with the network unavailable opens the workspace.
- Sign-out returns to the gate. Continue offline reopens the workspace. A different Logto account does not replace the link, and the workspace files remain.
- Restart sign-in abandons the previous browser attempt. That old callback does nothing.
- The account window at 360px wide shows the action, the handoff, and Continue offline without a horizontal page scroll.

Packaged Windows and packaged macOS receiving `integral-one://account/callback` remains the qualification named in the idea. `npm test` does not claim to prove that OS registration.

## Open Questions

None that change this gate. Before a configured run, the Logto console needs a first-party Native app named Integral One, the redirect URI `integral-one://account/callback`, and the public App ID in the maintainer config. That id is not chosen here.
