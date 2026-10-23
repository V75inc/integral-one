# Tasks: Logto account gate

Spec: `docs/SPEC-logto-account-gate.md`

Plan: `tasks/plan.md`

Status: waiting for approval. Do not start implementation until this list is approved.

## Task 1: ES384 check and version 3 record

**Description:** Add the main-process Logto module: a PKCE attempt, the pinned authorization and token calls, the ES384 ID-token check, and the version 3 local setup write. The live Clerk gate stays in place. Tests generate an ES384 key, stub `fetch`, and do not call Logto.

**Acceptance criteria:**

- [ ] A verified exchange calls only `https://auth.saas.apps.trueselph.com/oidc/token` and `https://auth.saas.apps.trueselph.com/oidc/jwks`, then writes a version 3 record bound to that issuer and the Logto subject
- [ ] The activation file and the key file contain neither the ID token, the access token, the refresh token, the code, nor the verifier
- [ ] Wrong `alg`, issuer, audience, or nonce; unverified email; a missing name; an expired `exp`; an `iat` older than five minutes; `jku`; a redirect; duplicate keys; a non-P-384 key; an oversized JWKS body; and a token-endpoint or JWKS failure write nothing
- [ ] A second subject or issuer cannot replace a linked setup, overlapping completions cannot replace the winner, a Clerk version 2 payload or legacy receipt is not overwritten, and a tampered record or missing key is not regenerated

**Verification:**

- [ ] Tests pass: `node --test tests/logto-setup.test.js`
- [ ] Build succeeds: not this task
- [ ] Manual check: not this task

**Dependencies:** None

**Files likely touched:**

- `desktop/accounts/logto-setup.js`
- `tests/logto-setup.test.js`

**Estimated scope:** Medium: 2 files

## Task 2: Public Logto config

**Description:** Accept only the public Logto config, and reject a secret, an unknown field, a Clerk field, and any other issuer. Keep the checked-in default unconfigured. Historical Clerk module tests stop calling this validator so they can keep exercising `clerk-setup.js` with a plain fixture.

**Acceptance criteria:**

- [ ] A configured file has only `contractVersion` 3, `provider` `"logto"`, `setupMode` `"logto"`, `configured` true, `environment` `"production"` or `"development"`, a non-empty `appId`, and issuer `https://auth.saas.apps.trueselph.com/oidc`
- [ ] A client secret, a Clerk publishable key, a Clerk issuer, an activation URL, legacy receipt keys, an unknown field, and a different issuer are rejected
- [ ] `desktop/accounts/config.json` stays `configured: false` with an empty `appId` and no secret
- [ ] An unconfigured config does not open the network

**Verification:**

- [ ] Tests pass: `node --test tests/logto-setup.test.js tests/clerk-setup.test.js tests/activation.test.js`
- [ ] Build succeeds: not this task
- [ ] Manual check: not this task

**Dependencies:** Task 1

**Files likely touched:**

- `desktop/accounts/config.js`
- `desktop/accounts/config.json`
- `tests/logto-setup.test.js`
- `tests/clerk-setup.test.js`
- `tests/activation.test.js`

**Estimated scope:** Medium: 5 files

## Task 3: Unconfigured production file

**Description:** Replace the tracked production account file with the same unconfigured Logto shape, so a later installer load does not present Clerk fields to the new validator. Do not write a real App ID.

**Acceptance criteria:**

- [ ] `desktop/accounts/config.production.json` is contract version 3, provider `logto`, setup mode `logto`, `configured: false`, and `appId` `""`
- [ ] The issuer is `https://auth.saas.apps.trueselph.com/oidc`
- [ ] The file has no Clerk publishable key, client secret, or other field

**Verification:**

- [ ] Tests pass: `node --test tests/logto-setup.test.js` still loads the new validator, and a one-off `validateConfig` of this file returns `configured: false`
- [ ] Build succeeds: not this task
- [ ] Manual check: not this task

**Dependencies:** Task 2

**Files likely touched:**

- `desktop/accounts/config.production.json`

**Estimated scope:** Small: 1 file

## Checkpoint: After Tasks 1-3

- [ ] `npm test` passes
- [ ] Both checked-in account configs are unconfigured Logto files with an empty `appId`
- [ ] `desktop/main.js` still constructs the Clerk bridge; a configured launch is not the manual check yet
- [ ] Review with human before proceeding

## Task 4: Browser handoff, callback, offline, and recovery

**Description:** Move the account controller onto the Logto module. One browser action stores a single in-memory attempt and opens the system browser. The OS callback completes setup. Offline continue, sign-out, recovery, and the same-account rule use the version 3 record. The account page is still the next task, so a configured manual launch waits for that checkpoint.

**Acceptance criteria:**

- [ ] The authorization URL uses the pinned auth endpoint, `response_type=code`, the public App ID, `redirect_uri` `integral-one://account/callback`, `scope` `openid profile email`, S256, and the matching challenge, state, and nonce
- [ ] A wrong state, a reused attempt, a missing code, an error parameter, or a callback with no outstanding attempt does not call the token endpoint
- [ ] A valid version 3 record opens the workspace with no network call; sign-out and Continue offline perform no network call; a Clerk version 2 payload or legacy receipt is not converted and recovery writes no Logto binding
- [ ] An untrusted IPC sender cannot start sign-in or complete setup; the content security policy names no Clerk or Logto host; closing the first-run window quits, and closing a later sign-in leaves local data unchanged

**Verification:**

- [ ] Tests pass: `npm test`
- [ ] Build succeeds: not this task
- [ ] Manual check: not this task

**Dependencies:** Task 3

**Files likely touched:**

- `desktop/accounts/controller.js`
- `tests/logto-setup.test.js`
- `tests/activation.test.js`
- `tests/clerk-setup.test.js`

**Estimated scope:** Medium: 4 files

## Task 5: Local account page and preload

**Description:** Make the account window a local gate. One action asks the main process to open the browser. The page explains the handoff and offers restart, Continue offline, and recovery. The sandboxed preload exposes no token argument. The offline setup-code panel is not shown.

**Acceptance criteria:**

- [ ] The renderer and preload do not import `@clerk/electron` or a Logto SDK; `integral-one:account-start` is invoked with no arguments
- [ ] A configured window shows one browser action and the handoff text; an unconfigured window keeps the current preview message and does not offer the browser action
- [ ] Continue offline and Open local workspace stay available on their existing conditions; the setup-code panel and its token or receipt IPC are gone
- [ ] The privacy details name Logto at `https://auth.saas.apps.trueselph.com/oidc`, say local files stay on this computer, and say this tenant’s user list includes dev signups
- [ ] The page remains one column in the existing 360×560 window and adds no second layout

**Verification:**

- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build:accounts`
- [ ] Manual check: not this task; the 360px pass is in the final checkpoint

**Dependencies:** Task 4

**Files likely touched:**

- `accounts/renderer.jsx`
- `accounts/appearance.js`
- `accounts/account.css`
- `desktop/accounts/preload-entry.js`
- `tests/activation.test.js`

**Estimated scope:** Medium: 5 files

## Checkpoint: After Tasks 4-5

- [ ] `npm test` passes
- [ ] `npm run build:accounts` succeeds
- [ ] The account window source does not import Clerk or Logto
- [ ] Review with human before proceeding

## Task 6: Stop the Clerk bridge

**Description:** Stop constructing the Clerk bridge and drop `@clerk/electron` once the live gate no longer imports it. The protocol scheme stays `integral-one`. `clerk-setup.js` remains for the upgrade script and the package inspector.

**Acceptance criteria:**

- [ ] `desktop/main.js` constructs the account controller without `createClerkBridge`
- [ ] `package.json` and `package-lock.json` no longer depend on `@clerk/electron`
- [ ] `npm test` does not load `@clerk/electron` to describe the live gate
- [ ] `npm run build:accounts` still writes the gitignored runtime config from the public config

**Verification:**

- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build:accounts`
- [ ] Manual check: search the live gate for `@clerk/electron` and find no import

**Dependencies:** Checkpoint after Tasks 4-5

**Files likely touched:**

- `desktop/main.js`
- `package.json`
- `package-lock.json`
- `tests/clerk-sdk.test.js`
- `scripts/build-accounts.js`

**Estimated scope:** Medium: 5 files

## Task 7: Signup copy

**Description:** Update the three documents that describe this gate’s signup provider. Name Logto at the pinned issuer, say local files stay local, and say the directory count includes this tenant’s dev signups. Leave the other Clerk history documents unchanged.

**Acceptance criteria:**

- [ ] The accounts section of `docs/GETTING-STARTED.md` says sign-in opens the system browser, Continue offline does not contact Logto, and a different account does not replace the link
- [ ] The signup paragraphs of `PRIVACY.md` name Logto at `https://auth.saas.apps.trueselph.com/oidc` and describe a local record with no stored Logto session and no second user list
- [ ] The account sentence in `README.md` names Logto as the signup provider for this gate

**Verification:**

- [ ] Tests pass: not this task
- [ ] Build succeeds: not this task
- [ ] Manual check: read the three passages and confirm they match the acceptance criteria

**Dependencies:** Task 5. Can proceed in parallel with Task 6.

**Files likely touched:**

- `docs/GETTING-STARTED.md`
- `PRIVACY.md`
- `README.md`

**Estimated scope:** Small: 3 files

## Checkpoint: Complete

- [ ] `npm run verify` passes
- [ ] The spec’s success criteria are covered by `tests/logto-setup.test.js` and the retargeted account tests
- [ ] Manual check from `tasks/plan.md`, once a maintainer config supplies the public App ID
- [ ] No installer, signing, or release step was run
- [ ] Ready for review
