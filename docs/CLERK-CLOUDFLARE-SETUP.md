# Clerk and Cloudflare: production setup walkthrough

**Status:** preparation guide, 18 October 2026. No production DNS change, paid subscription or deployment is completed by this document. We will work through the dashboards together after the repository cleanup.

## First, keep the scope small

Clerk manages signup, social sign-in, email verification, sessions and the user directory. Its production directory can provide the initial registered-user count. A separate account server is **not needed just to collect signups**.

Our current One implementation additionally calls a private registration service. That service records a distinct first-One-use marker and signs the installation-bound receipt that keeps local startup independent of Clerk/session expiry. Cloudflare DNS cannot replace that code. Clerk does not automatically issue this custom receipt.

**Recommended launch simplification:** use Clerk's production user directory as the initial signup count, and qualify a desktop-owned offline setup mechanism before removing the custom registration service. Keep one production Clerk application for both One and Business. This is a proposed engineering change, not the account flow already in this checkout.

Before choosing hosting or publishing account DNS, settle this implementation decision:

| Path | What it needs | What it gives us |
| --- | --- | --- |
| Clerk-only launch (recommended for simplicity) | Update One's existing registration/receipt contract; verify trusted completion, account binding, migration from existing receipts and offline restart | Signup/user-directory counts without a separately operated registration server |
| Retain current implementation | A production Node account service, protected signing key and HTTPS account portal | Signed offline receipts and a separate first-One-registration count |

Do not remove the registration call without a replacement. Until the Clerk-only path is implemented and qualified, the current client still requires its service for fresh setup. Do not count directory signups as active users or completed One installs. Later Business users will share the directory, so product-specific adoption can be added when needed.

## What to have open

- Clerk dashboard, signed into the V75 organization and the **Integral** application.
- Cloudflare dashboard, signed into the account managing **onintegral.ai**.
- Google Cloud and Microsoft Entra access if enabling those production providers.
- A place to store production secrets privately. Never paste secret keys into chat, GitHub or desktop configuration.

You complete login, MFA, CAPTCHA, new credential entry, legal agreements and any paid purchase yourself. I can inspect the visible dashboard, guide the choices, and enter the reviewed configuration where authorized. We will capture the actual values from the dashboard instead of guessing DNS targets or callback hosts.

## Step 1 — Create or select the production instance

1. Open **Integral** in Clerk and select **Production**. Create that instance if it does not exist.
2. Keep the development instance for testing; do not migrate test users into launch metrics.
3. Follow Clerk's production domain setup for `onintegral.ai`. Record the exact Frontend API/issuer hostname Clerk assigns. A production Electron app still needs a Clerk authentication domain.
4. Review any plan requirement shown by Clerk before accepting a subscription. Production need not imply every optional feature is required.

**Done when:** the dashboard clearly shows the production instance and its exact requested DNS records.

Reference: [Clerk production deployment](https://clerk.com/docs/guides/development/deployment/production) and [Electron production deployment](https://clerk.com/docs/guides/development/deployment/electron).

## Step 2 — Add only Clerk's requested DNS records

1. In Cloudflare, open **onintegral.ai → DNS → Records**.
2. Compare existing records with Clerk's requested type, name and target. Preserve the apex, website and mail records.
3. Add the exact records supplied by Clerk. For Clerk verification/authentication CNAMEs, use **DNS only** unless Clerk explicitly directs otherwise; proxying verification CNAMEs can hide their targets.
4. Return to Clerk and run its verification. Wait for DNS/certificate checks to complete before diagnosing sign-in issues.

Do not change nameservers, replace existing mail settings or invent a CNAME for `accounts` at this stage. Clerk's authentication domain and Integral's custom portal are different responsibilities.

**Done when:** Clerk reports its domain and TLS checks as verified. Record the specific changes for rollback; remove or revert only records added/changed for this setup.

Reference: [Cloudflare DNS-only use cases](https://developers.cloudflare.com/dns/proxy-status/use-cases/).

## Step 3 — Configure the native desktop client

1. In Clerk's production **Native applications** page, enable the **Native API** after reviewing its bot-protection implications.
2. Add the exact SSO redirect **`integral-one://account/`**.
3. Allow the exact native origin **`integral-one://account`**. Preserve other approved production origins. Do not copy localhost development origins into production or overwrite a populated allowlist blindly.
4. If the hosted account portal is retained, allow **`https://accounts.onintegral.ai`** when its deployment is ready. It is not a substitute for the native scheme origin.

**Done when:** native API, redirect and allowed origins match the reviewed production client. A packaged application is needed to qualify social deep-link return on macOS/Linux.

Reference: [Clerk Electron quickstart](https://clerk.com/docs/electron/getting-started/quickstart) and [OAuth deep links](https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links).

## Step 4 — Keep sign-in simple

1. Require a verified email; use email-code sign-in without a required username or phone number.
2. Enable Google with production OAuth credentials and the exact redirect URI Clerk supplies. Complete provider consent-screen/domain requirements.
3. Enable Microsoft with production credentials and the exact redirect URI Clerk supplies. Qualify the intended personal/work account types.
4. Keep the Integral logo, **Integral | one** wordmark and the approved local-data reassurance in One. Avoid a separate activation action.
5. Review actual signup requirements in the production dashboard; do not assume development settings copied completely.

**Done when:** fresh production email signup and both enabled social providers complete from the packaged app and return to it. Disable any provider not yet qualified for launch.

## Step 5 — Connect the chosen account flow

### If the Clerk-only simplification is adopted

Complete the One client change and its offline/migration qualification before building a release. Publish only the required public Clerk configuration. Configure Clerk-hosted account pages if needed; a custom `accounts.onintegral.ai` Node portal is optional. Record the chosen hosted-page URL from Clerk rather than guessing it.

### If the existing signed-receipt service is retained

1. Select a host for the existing Node service in the private Business repository. Cloudflare DNS alone is not a Node host, and Cloudflare Workers would require a deliberate adapter/qualification rather than a direct copy of this server.
2. Deploy the reviewed service/portal behind HTTPS with request limits, health checks and protected secret storage. Configure production Clerk keys, exact issuer/authorized parties, account origin and the production Ed25519 signing key server-side.
3. Add `accounts.onintegral.ai` using the deployment host's actual DNS instructions; verify HTTPS and the service health endpoint.
4. Build One with the matching **public** production key, Clerk issuer, account-service origin and named receipt verification keys. Keep old receipt verification keys for existing installations.
5. Confirm a fresh signup returns an accepted receipt. Check that repeat sign-in or another device does not count the same user twice.

**Done when:** the shipped client and chosen account architecture agree. No private service key or receipt-signing private key is bundled in One.

## Step 6 — Final readback

- [ ] Production email signup and verification succeed.
- [ ] Each enabled social provider returns to the packaged app.
- [ ] The account menu shows the signed-in identity.
- [ ] Sign-out and same-account sign-in retain existing records.
- [ ] Cold restart and Continue offline work during account-service/Clerk unavailability.
- [ ] An unrelated account cannot claim an existing local setup.
- [ ] Signups appear in production counts; development/test users are excluded.
- [ ] Counts are labelled registered accounts, not active users.
- [ ] Privacy/support links and account deletion expectations are published and accurate.
- [ ] Installer signing, dependency clearance and supported-platform gates remain separately satisfied.

The account setup is complete only after this readback. DNS verification alone does not qualify the desktop login experience or the first public release.
