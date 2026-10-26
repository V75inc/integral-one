# Spec: Logto account gate

Follows [Logto account gate](ideas/logto-account-gate.md). One capability: replace the Clerk desktop account gate with Logto, on par with the gate Clerk provides today. The workspace stays on local data.

## Objective

A person signs up or signs in once in the system browser. Logto creates the user. Integral One checks a fresh ES384 ID token, requires a verified email, and writes a private local setup record bound to the Logto issuer and the Logto subject. Later launches stay offline. Signing in again must be that same account. Deleting the Logto user does not delete local files. No token is stored.

The user is a person opening Integral One on this computer. Success is a first-run gate that finishes in the browser and returns to the app, then an offline workspace that still accepts only the linked account.

The Logto application is a first-party Native app. The return path is `integral-one://account/callback`, using authorization code and PKCE. Email, Google, and Microsoft are the sign-in methods on Logto’s page. The issuer stays `https://auth.saas.apps.trueselph.com/oidc`.

Registered-account counts are the users in this Logto tenant. Dev signups land in that same list. One does not keep a second list, a webhook, or a first-registration marker.

### Resolved decisions

These are the idea’s direction, stated so the gate can be tested.

1. **The sign-in page is the system browser.** The Integral Account window stays the local gate. It does not load Clerk, and it does not load Logto. One action opens the browser. Logto’s page offers email, Google, and Microsoft. One does not draw those forms and does not send a connector hint.
2. **The ID token is checked in the Electron main process.** The renderer never receives the authorization code, the PKCE verifier, or the ID token. The check uses the pinned JWKS URL. It does not use a URL from the token, and it does not fetch the OpenID discovery document.
3. **The local record is the same kind of setup Clerk writes today.** Same files, same per-installation Ed25519 signature, same installation id, same profile, no expiry, and no token. The binding is this issuer and the Logto subject.
4. **Clerk users are not imported.** A machine that already has a Clerk local setup or a legacy service receipt can be reset outside this capability. This build does not map a Clerk subject onto a Logto subject, and a Logto sign-in does not overwrite that older record. The existing recovery action can still open the local workspace. It does not write a new account binding.
5. **There is one tenant.** Configured development and production both use this issuer. A second tenant, an organization, Business login, and workspace authorization are out.

### Assumptions

1. Logto’s authorization and token URLs for this issuer are `https://auth.saas.apps.trueselph.com/oidc/auth` and `https://auth.saas.apps.trueselph.com/oidc/token`. The JWKS URL is the one in the idea, `https://auth.saas.apps.trueselph.com/oidc/jwks`. One pins those three URLs. A discovery document cannot retarget them.
2. The ID token’s `aud` is the public App ID as a string. Unverified emails and missing names or username-based accounts are accepted and normalize to the local profile.
3. A normal Logto ID token can live up to one hour. This gate does not reuse Clerk’s five-minute session-token cap. “Fresh” means the token from this PKCE exchange: `iat` within five minutes of the local clock, and `exp` still in the future.
4. The account controller can listen for the OS protocol callback without changing the desktop host. The host’s existing second-instance handler only focuses the window.
5. No new npm dependency is required. Verification uses Node’s `crypto`, as the Clerk checker does today.
6. The public App ID is configuration. It is not a secret. This spec does not contain it. A client secret is never a configuration field.

## Tech Stack

- Electron 44.9.0, already the app runtime. The gate uses the existing account `BrowserWindow`, `shell.openExternal`, and the `integral-one` protocol already declared for packaged builds.
- Node 22 `crypto` and `fetch` in the main process. ES384 is ECDSA P-384 with SHA-384. No Logto SDK and no JWT library.
- The account page stays the isolated renderer in `accounts/`, built by `npm run build:accounts`. React 18.3.1. `@clerk/electron` leaves this gate.
- Public account configuration only, loaded through the existing `INTEGRAL_ACCOUNT_CONFIG` path. The checked-in default stays unconfigured.
- The workspace, Core, and `vendor/` are unchanged. The desktop-host pin is unchanged.

## Commands

From the repo root, in PowerShell. Use a task-owned home and profile for any manual launch. Do not point these at an existing Integral installation.

Account contract, including the new gate tests:

```powershell
npm test
```

Distribution and the full local contract, before a commit:

```powershell
npm run verify
```

Manual gate, after the public App ID is available in a maintainer config outside this spec:

```powershell
$env:INTEGRAL_ACCOUNT_CONFIG = "<maintainer public config>"
npm start -- --home=$env:TEMP\integral-one-logto-home --user-data-dir=$env:TEMP\integral-one-logto-profile
```

An unconfigured source build must still open without that variable. Do not run `npm run build:installers`, a signed package, or a release workflow for this feature. Packaged Windows and macOS callback checks are qualification of the assumptions below, not part of `npm test`.

## Project Structure

| Path | Role |
| --- | --- |
| `desktop/accounts/config.js` | Accepts the public Logto config and rejects anything else, including a client secret. |
| `desktop/accounts/config.json` | Checked-in unconfigured default. No App ID. |
| `desktop/accounts/logto-setup.js` | PKCE exchange, ES384 check, local setup write, same-account rule. |
| `desktop/accounts/controller.js` | Account window, browser handoff, OS callback, offline continue, recovery. |
| `desktop/accounts/preload-entry.js` | Sandboxed IPC. No token argument. |
| `desktop/accounts/receipt.js` | Legacy receipt helper. The Logto gate does not call it. |
| `accounts/renderer.jsx` | Local gate page. No Clerk and no Logto frame. |
| `accounts/account.css` | Existing account page styles. |
| `accounts/index.html` | Account page shell. |
| `desktop/main.js` | Stops constructing the Clerk bridge. |
| `tests/logto-setup.test.js` | Token, config, callback, storage, and offline cases. No live network. |
| `package.json` | Drops `@clerk/electron` once the gate no longer imports it. Protocol scheme stays `integral-one`. |
| `vendor/` | Not edited. |
| `packages/desktop-host` | Not edited. |

`desktop/accounts/clerk-setup.js` and the Clerk bridge tests stop being the live gate. `scripts/configure-clerk-origin.py` is a Clerk console tool and is not part of this capability.

The app id stays `ai.integral.desktop`. The user-data directory stays `Integral`. Local account files stay `one-account/activation.json` and `one-account/setup-key.json`.

## Code Style

Match `desktop/accounts/clerk-setup.js`: strict CommonJS, double quotes, semicolons, and small functions. Limits and the pinned URLs live next to the check that uses them. The renderer stays a function component and does not import an auth SDK.

```javascript
const ISSUER = "https://auth.saas.apps.trueselph.com/oidc";
const PATHS = { auth: "/auth", token: "/token", jwks: "/jwks" };

function endpoint(name) {
  return ISSUER + PATHS[name];
}
```

The page fits the account window’s existing minimum of 360×560. One column, the current type and buttons, and no second layout for a narrow window.

IPC channel names stay under `integral-one:`. The start action takes no arguments. The main process is the only place that builds the browser URL.

## Behavior

### Public configuration

A configured file has only these fields:

| Field | Value |
| --- | --- |
| `contractVersion` | `3` |
| `provider` | `"logto"` |
| `setupMode` | `"logto"` |
| `configured` | `true` |
| `environment` | `"production"` |
| `appId` | The public Native app id, supplied outside this spec |
| `issuer` | `https://auth.saas.apps.trueselph.com/oidc` |

Any other field is rejected. A client secret, a Clerk publishable key, a Clerk issuer, an activation URL, and legacy receipt keys are rejected. Another issuer is rejected. `environment` does not select a second tenant. It remains the flag the update check already uses, and updates stay off unless that existing production flag is also on.

The checked-in `desktop/accounts/config.json` stays `configured: false` with an empty `appId`. An unconfigured build does not open the browser and does not contact Logto. Its account window keeps the current preview message, and existing local data is preserved.

### Browser sign-in

On a configured gate, the account window offers one browser action. The main process stores a PKCE verifier, a `state`, and a `nonce` in memory for that attempt only. It opens the system browser to the authorization endpoint with:

- `response_type=code`
- `client_id` set to the public App ID
- `redirect_uri` exactly `integral-one://account/callback`
- `scope` exactly `openid profile email`
- `code_challenge_method` `S256`
- the matching `code_challenge`, `state`, and `nonce`

It does not send `offline_access`, a resource, an organization, or a client secret. It does not open Logto inside a `BrowserWindow`.

The account window explains that sign-in finishes in the browser, and that the browser tab can be closed once Integral One opens. One does not close that tab. Restart sign-in drops the outstanding verifier and starts a new attempt. A callback for the dropped attempt does nothing.

Closing the account window on first setup quits, as it does today. Closing it from a later sign-in cancels that sign-in and leaves local data unchanged.

### Callback

The callback is accepted only as an OS open of `integral-one://account/callback` in the main process. macOS delivers `open-url`. Windows delivers the URL on the first instance’s `second-instance` command line. A launch whose command line contains a callback, while no attempt is in memory, does not exchange a code.

The account window’s `integral-one` handler keeps serving only the local allowlisted assets. `/callback` is not a page. The query string is not given to the renderer, and the workspace never navigates to it.

The callback’s `state` must match the outstanding attempt. The attempt is single-use. A mismatch, a second use, a missing code, or an error parameter does not call the token endpoint. The token request is a form POST from the main process to the pinned token URL, with `grant_type=authorization_code`, the code, the verifier, the App ID, and the exact redirect URI. No secret header. Redirects are errors. The body is size-capped and time-capped the way the current JWKS fetch is. A network or HTTP failure writes nothing.

If the token response includes an access token or a refresh token, those values are discarded. They are not written to disk, the account partition, or the renderer.

### ID token

The ID token is a single JWT from that token response. The main process rejects it unless all of the following hold:

- `alg` is `ES384`. `kid` is present. `jku`, `x5u`, and `crit` are absent.
- `iss` is exactly `https://auth.saas.apps.trueselph.com/oidc`.
- `aud` is the configured App ID string.
- `nonce` matches this attempt.
- `sub` is a non-empty string of at most 128 characters. It does not have to match Clerk’s `user_` form.
- `email_verified` may be true, false, or omitted.
- `email`, when present, is a string of at most 320 characters and contains one `@`. When omitted, username or sub derives the local email.
- `name`, when present, is a string of at most 256 characters. When omitted, username or an empty string is stored.
- `iat` is within five minutes of the local clock, allowing five seconds of future skew. `nbf`, when present, is not more than five seconds ahead. `exp` is in the future, after `iat`, and no more than one hour after `iat`.

The signature is checked with the pinned JWKS URL only. The fetch uses no credentials, does not follow redirects, times out, and caps the body. Exactly one key may match `kid`. That key is an EC P-384 signature key, `alg` absent or `ES384`, with no private `d`. Any other algorithm, curve, or key count fails closed.

The token is then dropped. The local record keeps the subject, the issuer, the email, and the name.

### Local setup

A successful check re-reads `one-account/activation.json` before writing, as today, so a concurrent completion cannot replace the winning account.

If a Logto setup is already stored, the new subject and issuer must match it. Otherwise the write is refused and local data stays as it was. The person sees that they must use the account linked to this computer.

If the stored record is a Clerk-era local setup or a legacy service receipt, this sign-in does not convert it and does not replace it. The files stay. Recovery can open the workspace for this process without creating a Logto binding.

The new payload is version 3:

```json
{
  "v": 3,
  "product": "integral-one",
  "installation_id": "<existing installation id>",
  "issuer": "https://auth.saas.apps.trueselph.com/oidc",
  "sub": "<Logto subject>",
  "completed_at": "<ISO time>",
  "profile": { "email": "<verified email>", "name": "<name>" }
}
```

It is signed with the per-installation Ed25519 key in `one-account/setup-key.json` and stored as `localSetup` on the existing activation file. There is no `exp`, no token, and no session id. The first successful setup creates the key. A later setup reuses it. A missing or damaged key is not silently regenerated to replace a linked owner.

A version 2 Clerk payload is not a valid Logto setup. Symlinks and oversized account files still fail closed.

### Offline, sign-out, and recovery

A valid version 3 record opens the workspace with no network call and no Logto session. Sign-out still only marks the local record signed out. The next launch shows the account window. **Continue offline** verifies that same local record, clears the signed-out mark, and does not contact Logto.

**Open local workspace** remains available when local installation data exists and the account record is missing, damaged, or not a valid Logto setup. It does not mint an installation id, a key, or a Logto binding.

The profile the rest of the app already reads is still the local email and name. An online deletion, an outage, or a removed Logto user does not delete workspace files and does not revoke the local record.

The offline setup-code panel is not shown. This config has no registration service.

### What stays put

- Workspace data, Core, and the desktop host.
- App id `ai.integral.desktop`, user-data name `Integral`, and the `one-account` paths.
- Account window size, title `Integral Account`, background `#171717`, and the Windows caption overlay already applied to that window.
- Sandbox, context isolation, the account partition, and navigation confined to `integral-one://account/` assets.
- Unconfigured preview behavior, damaged-record recovery, and the rule that quitting an unfinished first signup is not a failed Core boot.

The account-window content security policy no longer allows Clerk or its challenge hosts. The page loads only its own assets.

User-facing sentences that currently say signup uses Clerk are updated where they describe this gate: the account window privacy copy, the accounts section of `docs/GETTING-STARTED.md`, the signup paragraphs of `PRIVACY.md`, and the account sentence in `README.md`. They name Logto at this issuer, say local files stay local, and say the directory count includes this tenant’s dev signups. They do not describe a stored session or a second user list.

## Testing Strategy

Tests use `node:test` in `tests/logto-setup.test.js` and run with `npm test`. They generate an ES384 key, stub `fetch`, and do not call Logto. No coverage threshold is added.

Required cases:

- Configured public config has no secret field. A secret, an unknown field, or a different issuer is rejected. Unconfigured config does not open the network.
- A verified exchange calls only the pinned token and JWKS URLs, then writes a version 3 record. The activation file and the key file contain neither the ID token, the access token, the refresh token, the code, nor the verifier.
- Wrong `alg`, wrong issuer, wrong audience, wrong nonce, unverified email, missing name, expired `exp`, and an `iat` older than five minutes fail closed and write nothing.
- `jku`, a redirect, duplicate keys, a non-P-384 key, and an oversized JWKS body fail closed.
- A token-endpoint or JWKS failure writes no partial record.
- A second subject, or a second issuer, cannot replace a linked Logto setup. The installation id is unchanged.
- Two overlapping completions cannot replace the winner.
- A Clerk version 2 payload is not accepted as a Logto setup and is not overwritten.
- A tampered record or a missing key needs recovery and is not regenerated.
- Cold start, sign-out, and Continue offline perform no network call.
- A callback with the wrong `state`, a reused attempt, or a callback with no outstanding attempt does not call the token endpoint.
- An untrusted IPC sender cannot start sign-in or complete setup.

`npm test` no longer requires `@clerk/electron` to describe the live gate.

Manual check in a task-owned profile, once a maintainer config supplies the public App ID:

- Unconfigured start shows the preview message and does not open a browser.
- Configured start opens the system browser. Email, Google, and Microsoft can each finish, including email delivery, and the app then opens the workspace.
- The account window never shows the Logto page. After the app opens, the browser tab can be closed by the person.
- A second launch with the network unavailable opens the workspace.
- Sign-out returns to the gate. Continue offline reopens the workspace. A different Logto account does not replace the link, and the workspace files remain.
- Restart sign-in abandons the previous browser attempt. That old callback does nothing.
- The account window at 360px wide still shows the action, the handoff, and Continue offline without a horizontal page scroll.

Packaged Windows and packaged macOS receiving `integral-one://account/callback` remains the qualification named in the idea. `npm test` does not claim to prove that OS registration.

## Boundaries

- Always: verify the ID token in the main process; use PKCE and the pinned URLs; keep the local record offline and same-account; leave workspace files in place when Logto is down or the cloud user is gone; preserve `ai.integral.desktop`, `Integral`, and `one-account`; run `npm run verify` before a commit; use a task-owned home for a manual launch.
- Ask first: adding a dependency, changing the desktop-host pin, writing a real App ID into a tracked config, and any installer, signing, or release step.
- Never: put a client secret or a Management API credential in the repo, the spec, or chat; store a Logto token or session; embed Logto or Clerk in the account window; import Clerk users; edit `vendor/` or Integral Core; change the issuer string; add a dev tenant, an organization, a webhook, or workspace authorization.

## Success Criteria

- A configured first run opens the system browser to this issuer, returns through `integral-one://account/callback`, and opens the workspace only after a fresh ES384 ID token passes the checks above, including a verified email.
- The written record is a version 3 local setup bound to `https://auth.saas.apps.trueselph.com/oidc` and that Logto subject. No token is stored. The next launch does not contact Logto.
- Sign-in again with a different subject or issuer leaves the local record and the workspace unchanged.
- Deleting or disabling the Logto user does not delete local files. Continue offline still works.
- A Clerk-era local setup is not converted and is not overwritten. Recovery can still open that workspace and does not write a Logto binding.
- The account window does not load Clerk or Logto. `@clerk/electron` is not started. Email, Google, and Microsoft are chosen in the browser.
- The checked-in default config is unconfigured and contains no App ID and no secret. `npm test` covers the cases in Testing Strategy without a live tenant.
- The account window, `docs/GETTING-STARTED.md`, `PRIVACY.md`, and `README.md` describe Logto, not Clerk, as the signup provider for this gate.

## Open Questions

None that change this gate. Before a configured run, the Logto console needs a first-party Native app named Integral One, the redirect URI `integral-one://account/callback`, and the public App ID supplied in the maintainer config. That id is not chosen here. Leave secrets out of chat and out of the repo.
