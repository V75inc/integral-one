# Integral One privacy notice

**Release candidate notice · 21 October 2026 · production review pending**

V75 Inc. maintains Integral One. Your workspace files and records stay on your
computer. Account signup is online; after setup, local access continues offline.
This notice describes the development preview. A signed Apple Silicon installer
is available, and real sign-in/signup has been qualified. Production privacy
review remains pending. Retention periods, hosting locations and deletion
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

## Application updates

Integral One checks for Core and compatible One releases automatically after
startup and every six hours while open. One 0.1.9 also checks on wake/window focus
when the last check was at least an hour ago. Help provides a manual check and an automatic-check
opt-out. Stable builds query PyPI; development builds query TestPyPI. Both query
the public V75 GitHub release endpoints. Those services receive ordinary request
and connection information. These requests send
no account token, installation identifier, workspace records or model credentials.
You approve downloading an available update and restarting to install it
separately. One 0.1.9 can download compatible qualified Core/UI payloads from
GitHub and the original Core wheel from Python package-file hosts without
replacing the desktop app. The native update panel may send an operating-system
notification when permitted. No update daemon runs after One quits. Update checks
are independent of account signup and marketing.

## Integral account signup

Official first-time setup requires signup or sign-in. Logto at
https://auth.saas.apps.trueselph.com/oidc handles authentication
and email verification. Depending on the method you choose, it and the sign-in
provider process your email, account/profile identifiers, name or profile image,
authentication state and connection/security information such as IP address and
browser details. One displays the verified account email and name from its local
signed setup record. Passwords and provider credentials are not sent to Core.
Your local files stay local.

The desktop keeps a local record on this computer: the account identifier,
installation id, setup timestamp and minimal display profile, signed with a
private local integrity key. The record has no expiry and is checked locally.
One stores no Logto session. There is no second user list, separate
registration server, centrally stored installation inventory, or first-One-use
marker. Authentication providers have their own operational/security logs;
their configuration and retention still need release review.

Older configuration-v1 builds use a separate registration service that records a
first-One-registration marker and returns an installation-bound signed receipt.
That compatibility path sends a random installation code, not a hardware
fingerprint. Existing receipts remain supported; their data is not silently
migrated into a new online account.

This tenant’s user list includes dev signups. Administrative reports count
distinct registered Integral accounts and signup cohorts in that list. They
are not completed-installation, One-only registration or active-user
measurements. Repeat sign-in uses the same account. Directory deletion can
reduce the count. No ongoing activity heartbeat or workspace-content analytics
is added by this signup integration.

The separate hosted signup portal requires its own equivalent review before
launch. Signup does not enroll you in a marketing mailing list.

## Offline access and sign-out

The desktop keeps a setup record containing the account identifier,
random installation code, setup timestamp and minimal display profile. A new
record is a version 3 local setup signed with the private local integrity key;
older receipts retain their service signature. The record has no expiry and is
checked locally. The local key is not a remote access credential or a replacement
for OS security. This gate stores no Logto token and holds no Clerk token in a
desktop bridge. The account window uses an in-memory Electron session partition.

Once set up, an account outage or expired cloud session does not disable existing
local access. After sign-out, choose Sign in or Continue offline. Sign-out closes
the local application session; it is not a filesystem lock, a global social-provider
logout or a substitute for your operating-system account and disk protection.
Back up the installation's account state, local setup key and recovery keys with your workspace.

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

Logto at
https://auth.saas.apps.trueselph.com/oidc processes end-user account
information for this gate. Your chosen social/AI providers have their own
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

Update archives remain locally under the Integral user-data directory until you
remove them. Independent runtime updates also retain full cold home snapshots
and failed-trial copies beside the workspace for recovery. These contain the
workspace, account setup state and local keys; protect them like the original
workspace. No automatic deletion schedule is imposed by this feature.
