# Integral Account — native sign-in, local activation and Business continuity

**26 October update:** The One desktop now adopts [the Logto PKCE gate](SPEC-logto-account-gate.md), with browser sign-in, fixed issuer/JWKS endpoints and an offline version-3 local setup record. This supersedes the Clerk provider and SDK choices in the historical plan below. Existing Clerk records and keys remain intact; the local recovery action preserves access without importing or relinking an account. One does not upload operational data during registration.

**21 October update:** [Clerk-only setup](CLERK-ONLY-SETUP.md) implements the proposed launch simplification in configuration v2. The service-backed flow below remains the legacy v1 contract. Production qualification is still required.

**Adopted: Clerk.** This supersedes the earlier Cognito/custom account-stack
recommendation. Keep the first launch small: social/email signup, verified email and distinct-account adoption counts. Signup completes automatically;
there is no separate activation action. A durable local setup receipt supports offline use.
Implementation and development qualification are tracked in CLERK-INTEGRATION.md;
production DNS, credentials/deployment and platform release gates remain separate.

## User-facing simplicity

The page contains the **Integral | one** mark, signup/sign-in controls and one
reassurance: **Your files and records stay on this computer. After signup, Integral
One works offline.** Signup or sign-in automatically completes setup and opens the
app. There is no Activate button, licence-key step or separate approval to use it.
Offline setup/recovery stay collapsed. No internal tracking/receipt terminology
belongs in the main signup flow.

## Shared identity and online setup

Use one V75-owned Clerk application named **Integral**. One and Business share
its production user directory; do not create a separate Clerk application for
each product. Development and production instances are separate: development
test users are never launch metrics and are not production customer accounts.
Start with Google, Microsoft and email-code sign-in. No required username or phone.

The user confirmed the domain **onintegral.ai**. Target **accounts.onintegral.ai**
for the account/activation portal; select a separate Clerk authentication hostname
using Clerk's actual production domain instructions. Domain ownership does not
mean DNS/TLS/email delivery are already configured. Production must use HTTPS,
production Clerk credentials and approved V75 signing keys. No paid plan or DNS
change is authorized by this document.

Clerk handles credentials, social connections, email verification and the user
directory. Business `ecosystem/activation` owns a small independent Node service
and portal, outside customer cells and the operator console. Use Clerk's private
user metadata to mark the first One activation. No separate account database,
Cognito pool, DynamoDB, custom password system or marketing platform is needed
for this initial scope. Administrative aggregate metrics run with service-side
credentials; no public user-list/analytics endpoint is exposed.

## Identity and counting

- The identity is the exact Clerk issuer plus stable user subject. Email is
  editable and never the account key or proof of workspace membership. A later
  provider migration must preserve an explicit mapping, not match email blindly.
- Registered Integral accounts: unique users in the production Clerk instance.
- Verified Integral accounts: users whose primary email is verified.
- Registered One accounts: unique users with a server-written first-One-registration
  marker. Retrying signup completion or setting up another computer does not add users.
- Report signup/One-registration cohorts by month. These counts are adoption, not
  monthly active usage. No ongoing heartbeat, record telemetry or hardware ID is
  introduced. Once Business starts, overall registrations and One registrations
  remain separately labelled; production metrics exclude all development data.

Central information is the Clerk account and its first One registration timestamp/source.
Installation IDs are random challenges carried in signed receipts; the initial
service does not maintain a central device inventory. Marketing subscription is
not inferred. Operational records, files, chat, backups, model keys and encryption
secrets are not sent by activation. State actual retention/deletion/support policy
before inviting production users. Hosted inference remains a separate data flow.

## Signup flow and local access

One's dedicated account window uses the pinned Clerk Electron SDK. Clerk's Native
API and the exact `integral-one://account/` callback must be configured. Social
login opens the system browser; only the account window receives Clerk's bridge.
The Core editor retains its current origin, CSP, local owner and native session
controller. Cloud tokens never become Core workspace authorization.

After signup/sign-in, the client automatically calls the registration endpoint.
It verifies the session signature/expiry, exact issuer,
allowed authorized party, complete user session and verified/eligible email.
Only after the server-owned registration marker is persisted does it issue an
Ed25519 signed receipt bound to a random installation ID. One verifies that
receipt against embedded public keys and stores it privately with the installation.
The receipt has no expiry and is not an API/Business authorization token.

Subsequent local starts validate the receipt locally, without a cloud check or
retained Clerk refresh token. Expired login, network outage, account deletion or
suspension cannot erase data, reassign local ownership or invalidate the already
issued local receipt. Keep retired verification keys for existing receipts across
updates; rotate issuers/keys only with a tested continuity/recovery plan.

Offline signup/setup uses the same endpoint: copy the installation code to a
connected browser, sign up/sign in on the account portal, copy its setup code
back to One. Registration requires a connection somewhere. A response for another
installation, altered response or untrusted signing key is rejected. No extra
proof-key protocol is needed for simple adoption counting; this is not anti-piracy
or non-copyable hardware licensing.

Existing installations without a receipt retain an explicit **Open existing local
data** recovery path while signup is rolled out. They are not falsely counted
as One registrations. Corrupt local state must be preserved for recovery, not overwritten.
Never gate encryption-key recovery/export on a central password. Keep the receipt
and `one-account` state with the user's installation backup.

## Business continuity

The future Business sign-in uses the same production Clerk instance and canonical
issuer/subject. `ecosystem/identity` resolves that shared account without granting
resource authority. Business must separately establish current workspace roles,
entitlements and import permissions; it must not accept an offline One receipt as
a cloud login or auto-grant team access to personal purchases.

Joining Business does not require a second registration. It does require choosing
or creating an authorized workspace. Transferring One data remains explicit:
compatibility preview, verified backup, upload consent, resumable transfer,
reconciliation and a completion report. Sign-in never starts an upload. No
bidirectional sync or complete Business login integration is claimed by this slice.

## Qualification and deployment

Qualify the actual packaged macOS SDK/UI and email-code path, social callback,
registration idempotency, wrong issuer/party/email, callback isolation, receipt
signature/binding, service outage and account-independent cold restart. Mocked
contract tests are not live provider/social proof. Supported Windows/Linux,
signed builds, clean-machine/recovery and production provider/DNS/domain setup
remain release gates. Account-service deploy is separately reviewed; maintain
rate limits, request limits, signing-key custody, operational ownership and
aggregate metrics access. No production launch may use a `pk_test_` key, local
loopback activation endpoint or development signing key.

Reference: [Clerk Electron SDK](https://clerk.com/docs/reference/electron/overview),
[packaged native OAuth callbacks](https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links).

## Developer community and marketplace

Core is the public Apache engine/neutral UI/SDK contract project; One is the
public desktop distribution. Developers can contribute to either relevant layer,
extend Core and build commercial or open-source independent Apps without buying
Business or registering merely to clone/build the Apache source.

Start a useful contributor path now: setup guide, small reference App, documented
ToolContext/contracts, validation command, issue/PR templates, human-maintainer
review and a compatibility/version policy. Keep generic invariants/authorization
in Core and domain App logic in its package. Publish engineering roadmap and
review expectations; AI-assisted submissions still need accountable human owners
and evidence. Do not demand copyright assignment merely to use Apache Core.

Marketplace phases:

1. Public developer docs/reference packages and local file import; no marketplace
   service required for useful development.
2. Account-based publisher enrollment and submission with explicit licenses,
   source/publisher provenance, capabilities, Core compatibility and dependencies.
3. Curated public catalog, signed immutable declarative packages, anonymous
   browsing, account-required official acquisition/restoration. Review moderation,
   reports/takedowns and appeals before opening submissions broadly.
4. Paid Apps only after publisher/payout/tax/refund and per-user/team/deployment
   terms, entitlement issuance/revocation and export continuity are qualified.
   No fee/revenue-share promise is set by this plan.
5. Executable extensions require explicit admission/isolation design. A publisher
   signature proves provenance, not a sandbox. Keep Core's contracts neutral.

### Desktop account continuity

Show the signup account's verified email/name from a signed local receipt.
Keep the installation owner and existing record IDs stable. Provide Clerk
sign-in after sign-out, plus an explicit offline reopening choice. Reject a
foreign account on an already linked installation. Sign-out is a local session
boundary, not filesystem protection or a global Google/Business sign-out.

## Launch simplification review — 18 October 2026

Clerk already supplies authentication and a registered-user directory. A separate registration service is required by the current signed-receipt implementation, not by signup counting itself. For a smaller launch, consider Clerk directory counts with a qualified desktop-owned offline setup mechanism; retain existing receipt compatibility and account binding. This is proposed, not implemented. See [the production walkthrough](CLERK-CLOUDFLARE-SETUP.md) before provisioning hosting.


## Accepted Core/runtime boundary — 18 October 2026

One composes the shared Core engine using the local runtime preset. Core enforces
installation identity and operation limits; One owns native transport/session
bridging, Clerk signup, the signed offline setup record, branding and installers.
The reusable Apache desktop-host source/tests now live in `packages/desktop-host`.
Business may reuse the host package independently of One's account views.

Signup remains signup, with automatic completion. No new activation screen,
recurring cloud authorization, data migration or account-to-workspace reassignment
is introduced by runtime composition. Keep application/data paths, installation
and owner IDs, private recovery keys and receipt verification keys unchanged.
See [accepted architecture and migration](CORE-HOST-BOUNDARY-PROPOSAL.md).

The Core candidate is an explicit development snapshot pending independent source
review and release. Qualify both local and hosted configurations before replacing
One's pinned engine; a hosted preset never substitutes for tenant/resource checks.
