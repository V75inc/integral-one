# Clerk-only desktop setup

Release candidate implementation, 21 October 2026. Production provider and native
installation qualification remain separate from the passing local contracts.
This supersedes the registration-server requirement in the earlier account plan
for new configuration-v2 builds. Configuration v1 remains service-backed.

## Trust and local continuity

The isolated account renderer obtains a fresh **session token**, not a custom JWT
template. Only its trusted main frame can ask the main process to complete setup.
The main process verifies RS256 using public keys fetched from the exact configured
Clerk issuer. Redirects, token-provided key URLs, unknown/duplicate keys, unexpected
issuer/origin, expired/future tokens, incomplete sessions, impersonation and
unverified email are rejected. Network/key responses are bounded. No Clerk secret
key, registration host or centrally operated receipt signer is needed.

On successful verification, One writes a private local setup record bound to the
existing random installation ID and canonical Clerk issuer/subject. It signs this
record with a per-installation Ed25519 key. It stores no Clerk token or session ID.
This is local integrity protection, not an anti-piracy mechanism, a filesystem lock
or a Business credential. A person who controls the OS account can also control
its local files. Backup both `one-account/activation.json` and `setup-key.json`.

Local startup, profile display and Continue offline verify the local record
without an online lookup, recurring expiry or central account-status dependency.
An online account deletion does not erase local data. Re-sign-in must match the
original account. State is reread after online verification before any write, so
concurrent sign-ins cannot replace the winning account. Damaged state/key files
remain recoverable and are never silently regenerated to replace a linked owner.

Legacy service-signed receipts and their verification keys/origins remain
supported. A same-account sign-in can add the new local record while preserving
the original receipt bytes and installation ID. Import cannot overwrite a v2
binding. Keep the legacy public keys and exact service origin when distributing
an upgrade to installations with such receipts. Development issuers/accounts do
not become production accounts or production counts; existing local-data recovery
remains available without reassigning the local owner.

## Production configuration

`desktop/accounts/config.production.json` contains only public values read from
the Integral production dashboard. It is a candidate configuration, not evidence
of successful signup. The unconfigured source default remains usable for builds.

Use `INTEGRAL_ACCOUNT_CONFIG=desktop/accounts/config.production.json` for the
production candidate. Never add Clerk secret keys. Native API and the exact
`integral-one://account/` redirect/origin must be configured and qualified.

In Clerk **Sessions → Customize session token**, preserve existing claims and add:

```json
{
  "integral_one_email": "{{user.primary_email_address}}",
  "integral_one_email_verified": "{{user.email_verified}}",
  "integral_one_name": "{{user.full_name}}"
}
```

Use session-token version 2. Do not create a JWT template for these values; One
requires the session ID and active/completed session state. Require a verified
email in the production authentication settings. Recheck actual packaged signup
and callback behavior after changing provider configuration.

The production Google flow completed in the packaged macOS candidate on 21 October
2026, returning to the app and producing a verified local setup record. The owner
observed Google's browser page remaining open with a spinner after the app opened.
The SDK launches the system browser and receives an OS deep link; it does not own
or close that browser tab. The account screen now explains that users can close
the tab once Integral One opens. Automatic browser completion/closure remains a
provider/SDK UX limitation, not a pending local setup operation. See Clerk's
[documented deep-link flow](https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links).

Registered-account counts come from the production Integral directory. They are
not counts of completed installs, One-only registrations, active use or workspace
activity. No private first-One-registration marker is written in this mode.

Fresh setup requires this computer to connect to Clerk once. Subsequent local use
is offline. The old separate-device receipt-import option is shown only when a
legacy service and its trusted keys are configured; Clerk-only builds do not
advertise an unavailable portal or portable setup-code service.

## Evidence and remaining gates

Local adversarial tests cover signatures/claims, bounded key retrieval, wrong
account, concurrent binding, legacy continuity, token-free storage, damaged keys
and offline cold start/sign-out/re-entry. They are not live-provider evidence.
Run `npm run verify`, UI build/tests, package inspection and the real production
signup/offline/upgrade checks before marking registration qualified.

References: [session-token customization](https://clerk.com/docs/guides/sessions/customize-session-tokens),
[manual verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification),
[JWT shortcode types](https://clerk.com/docs/guides/sessions/jwt-templates).
