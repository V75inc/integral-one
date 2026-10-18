# Clerk integration and qualification

## Implementation

- SDK `@clerk/electron` 0.1.1 is pinned. Clerk labels Electron support Beta.
- `accounts/renderer.jsx` provides simple signup/sign-in with automatic completion, offline setup and
  existing-data recovery in a dedicated sandboxed, isolated account window.
- `desktop/accounts` validates public configuration, exact window/frame/origin,
  fixed protocol assets and Ed25519 installation-bound receipts. Tokens stay in
  memory; the Core renderer receives neither the Clerk bridge nor service keys.
- Core host's provider-neutral trusted `beforeBoot` hook waits for product
  onboarding. Existing owner/auth/graph policy remains unchanged.
- Private Business `ecosystem/activation` supplies a bounded authenticated signup-registration endpoint,
  offline portal and administrative aggregate metric script. Clerk private user
  metadata counts one activation per account. `ecosystem/identity` defines the
  shared issuer/subject resolution for future Business clients.

For the guided production setup and the proposed Clerk-only simplification, see [Clerk and Cloudflare](CLERK-CLOUDFLARE-SETUP.md). The implementation below remains the current signed-receipt design.

## Configuration

Prepare a public JSON configuration using `desktop/accounts/config.json` as the
shape. Set `configured`, `environment`, `publishableKey`, `clerkIssuer`,
`activationUrl` and named Ed25519 `publicKeys`. Never add a secret field.

```sh
INTEGRAL_ACCOUNT_CONFIG=/path/to/public-account-config.json npm run build:accounts
INTEGRAL_ACCOUNT_CONFIG=/path/to/public-account-config.json CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
```

The build validates the public config and generates `config.runtime.json`, the
sandbox preload and UI assets. They belong in the app bundle, not the source PR.
With no configuration, a fresh installation shows honest setup unavailability;
existing local installations can still open for recovery. Production requires
HTTPS and a live Clerk key. A `pk_test_` development configuration may target a
local `127.0.0.1` activation service solely for qualification.

## Clerk application setup

The V75 **Integral** development application has been created. Configure one
production instance later for both One and Business:

1. Email required/verified, code sign-in; Google and Microsoft social connections.
2. Native API and exact redirect `integral-one://account/`.
3. Add `integral-one://account` to allowed origins, retaining other approved
   portal/client origins. Do not replace a populated origin list blindly.
4. Production account portal target is `accounts.onintegral.ai`; confirm DNS/TLS,
   Clerk authentication domain, OAuth provider production credentials and email.
5. Service credentials/signing key stay server-side. Pin only the public signing
   keys in One. Provisioning DNS/production hosting is not part of local builds.

## Evidence — 18 October 2026

| Check | Result |
|---|---|
| Independent One contracts | 34 Node tests plus three Python wheel-composition tests pass. Three Node cases execute the actual pinned Clerk main-process SDK with mocked Electron transport. |
| Service/shared identity | 14 tests pass, including the actual Clerk JWT verifier rejecting bad signatures, expired sessions and wrong authorized parties. Same issuer/subject resolves for a future Business client without tenant rights. |
| Native sandbox/renderer | Packaged macOS arm64 signup page renders Google, Microsoft and email code through the real Clerk SDK; narrow account IPC/preload works with sandbox and context isolation. |
| Live development signup | Two reserved Clerk test emails verified with development OTP; latest flow automatically completed registration and opened Core, with no separate activation button. |
| Adoption counts | Initial qualification reported three registered/verified Integral accounts and three distinct One registrations (two reserved test emails plus the approved Gmail social test). Test fixtures cover idempotent retry/additional devices. These are not production users. |
| Local work | Native runtime readiness, owner session, reference App installation, manual record and startup audit history pass after signup. |
| Registration outage/cold restart | With the local registration service stopped, a full native/Core restart opens the owner session and retains the test record. No saved Clerk refresh token is required. The OS network was not globally disconnected. |
| Callback configuration | Exact native redirect and origin verified against Clerk's Backend API; development portal loopback origin is separately allowlisted. |
| Social transport | Live Google/Gmail browser consent and return to the packaged app passed, followed by automatic registration and Core startup. Microsoft is enabled/rendered, but its real provider round trip remains untested. |
| Core companion | Shared host/reference desktop tests and all 16 substrate guards pass; no Core backend authentication is replaced. |
| Package | Unsigned arm64 app includes account UI, sandbox preload, public config, Core runtime and notices; secret/evidence exclusions pass inspection. |
| Dependencies | New private account-service tree has zero npm audit findings; One root retains eight moderate build-tool findings from the previously documented sprintf-js family. Existing Core UI audit findings remain separately documented. |

The simple page contains no activation button and explicitly reassures that files
and records stay on the computer. The account/backend receipt names are internal,
not an additional licence or subscription requirement.

### Open release gates

Clerk Electron remains Beta. Production Clerk instance/domain/DNS and provider
credentials, production HTTPS service/key custody/privacy/support, signed app and
Windows/Linux/clean-machine/recovery qualification are not completed. The signup
portal and backend are implemented and built locally; no public production API or
DNS change is claimed. A full Business login/tenant mapping and operational-data
migration are future work; shared account resolution alone is not tenant access.
Independent Core release/dependency/license gates remain separate.


## Desktop identity and sign-out follow-up

The desktop account display uses the verified primary email and name carried in
its signed signup receipt. This is a local presentation profile; Core retains
its installation-bound owner ID and its internal owner identity. Clerk identity
never creates a second local user or changes workspace permissions. Receipts
now contain this minimal profile, stored privately alongside the existing
installation receipt. Older receipts acquire the profile on the next Clerk
sign-in. No files or records are uploaded.

Sign-out clears/revokes the current local API session and persists a signed-out
state. Reopening the native owner session then requires an explicit choice:
**Sign in** opens Clerk, while **Continue offline** reopens the existing local
workspace without a cloud request. The account linked to this computer must
match the original receipt subject and issuer; another account cannot claim it.
Signing back in does not create another registration count.

This is a single-owner local application. Sign-out is not a filesystem lock or
encryption boundary, and does not sign out the browser's Google account or
other Integral clients. Use the operating system account and disk protection
for that boundary. Local files, records, installation and workspace IDs remain
unchanged across sign-out and sign-in. Shared-device/multiple-owner account
switching is outside this release.

The signup view now includes the original Integral mark beside Integral | one.
Startup uses a self-contained softly glowing mark, the wordmark, and
“Opening your workspace…”; reduced-motion preferences disable animation.

## Account presentation and OAuth recovery

See ACCOUNT-UI-REVIEW.md for the current compact signup/sign-in/verification,
signed-out desktop and portal review. Final composed UI qualification is 1,879
passing tests. The native browser-handoff notice offers Restart sign-in, which
relaunches the app to dispose a pending SDK flow without changing local data.
A completed Google consent tab can still show Loading in the external browser;
this does not imply the native signup is pending. That external page is outside
Integral's UI control. Production/cross-platform gates remain open.
