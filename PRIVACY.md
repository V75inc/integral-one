# Integral One privacy notice

**Development preview · 18 October 2026**

V75 Inc. maintains Integral One. Your workspace files and records stay on your
computer. Account signup is online; after setup, local access continues offline.
This notice describes the implementation in this source preview. A production
account service has not launched. Retention periods, hosting locations and deletion
operations must be finalized before public signup. Contact
**[support@v75inc.com](mailto:support@v75inc.com)** for privacy and account requests.

## Your local workspace

Records, attachments, chat history, local backups and model credentials belong to
the local installation. The signup integration does not upload them. You control
local deletion and backups; uninstalling the application is intended to retain
workspace data. Copies you export, synchronize with other software or back up
remain subject to your chosen storage arrangements.

Local does not mean every feature is offline. If you choose a hosted AI provider,
the prompts and context needed for the request go to that provider. Downloads,
external links and extensions you choose can contact their own services. Review
their settings and policies before sending confidential information.

## Integral account signup

Official first-time setup requires signup or sign-in. Clerk handles authentication
and email verification. Depending on the method you choose, it and the sign-in
provider process your email, account/profile identifiers, name or profile image,
authentication state and connection/security information such as IP address and
browser details. One displays the verified account email and name from its local
signed setup record. Passwords and provider credentials are not sent to Core.

The current account service verifies your session, records a first-One-registration
timestamp and product marker in Clerk's server-controlled account metadata, then
returns a signed setup record. It receives a random installation code, not a
hardware fingerprint. The current service code does not maintain a device
inventory or log request tokens, email addresses or request bodies. Production
hosting and authentication providers can have their own operational/security logs;
their configuration and retention still need release review.

Administrative reports count distinct registered accounts and registration cohorts.
They are not active-user measurements. Repeat setup does not intentionally create
another user count. Directory deletion can reduce the count. No ongoing activity
heartbeat or workspace-content analytics is added by this signup integration.

Optional Clerk SDK telemetry is disabled in the desktop signup view. This does
not disable authentication/security processing or make third-party sites offline.
The separate hosted signup portal requires its own equivalent review before
launch. Signup does not enroll you in a marketing mailing list.

## Offline access and sign-out

The desktop keeps a signed setup record containing the account identifier,
installation code, registration timestamp and minimal display profile. It has no
expiry and is checked locally. Clerk tokens in the desktop bridge are held in
memory and cleared when setup completes or the account window closes; the account
window uses an in-memory Electron session partition.

Once set up, an account outage or expired cloud session does not disable existing
local access. After sign-out, choose Sign in or Continue offline. Sign-out closes
the local application session; it is not a filesystem lock, a global social-provider
logout or a substitute for your operating-system account and disk protection.
Back up the installation's account state and recovery keys with your workspace.

An online account deletion does not remotely erase local files or an already
issued setup record. Local copies remain until you remove them. Damaged account
state is preserved for recovery. Linking a different online account to an existing
workspace is not supported by this preview.

## Shared accounts and future Business

The plan uses one production Integral account directory for One and Business.
Signing in does not create Business workspace access or upload your One data.
Any future transfer requires a separate explicit choice and compatibility checks.
Business migration and marketplace services are not available in this preview.

## Providers, requests and retention

Clerk processes end-user account information for V75 Inc. under the applicable
service arrangements. Its general [privacy policy](https://clerk.com/legal/privacy)
explains the distinction between Clerk's own customer information and end-user
data processed for its customers. Your chosen social/AI providers have their own
policies. Download hosts and operating-system signature services receive ordinary
download/verification requests. No provider is represented as receiving no data.

Do not send account identifiers, private records or credentials in public GitHub
issues. Contact **support@v75inc.com** privately. Account access, correction,
deletion and other applicable
privacy requests need an authenticated private process before launch; no automatic
account-deletion screen or response-time guarantee is claimed here.

Local data remains under your control. Exact hosted account, security-log, support
and backup retention/deletion schedules and processor/transfer arrangements are
open production decisions, recorded in [privacy readiness](docs/PRIVACY-READINESS.md).
This preview notice is not a claim of legal review or SignPath approval.
