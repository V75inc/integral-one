# Logto account gate

## Problem Statement

How might we switch Integral One’s first-run account gate from Clerk to `https://auth.saas.apps.trueselph.com/oidc` so it behaves the way Clerk does today?

## Recommended Direction

A person signs up or signs in once in the system browser. Logto creates the user. One checks a fresh ES384 ID token against `https://auth.saas.apps.trueselph.com/oidc/jwks`, requires a verified email, and writes the same kind of private local setup record, bound to that issuer and the Logto subject. Later launches stay offline. Signing in again must be the same account. Deleting the Logto user does not delete local files. No token is stored.

The Logto application is a first-party Native app. The return path is `integral-one://account/callback`, using authorization code and PKCE. Email, Google, and Microsoft are the sign-in methods. The issuer stays `https://auth.saas.apps.trueselph.com/oidc`.

You count signups by looking at users in the Logto console, the same way the Clerk directory is the count today. Dev signups land in that same list. Clerk kept them out by using a separate instance. A second Logto tenant can do that later. An organization inside this tenant would need a server, so it is out.

## Key Assumptions to Validate

- [ ] Email, Google, and Microsoft each complete a real sign-in on this Logto tenant, including email delivery.
- [ ] A packaged Windows build and a packaged macOS build receive `integral-one://account/callback`.
- [ ] The ID token from this tenant includes `email`, `email_verified`, and `name` for those three methods.
- [ ] This issuer string never changes. A custom domain later would strand existing setups.

## MVP Scope

Replace the Clerk account window with the Native browser flow. Verify the ID token in the Electron main process. Keep the local offline setup and the same-account rule. Leave the workspace on local data.

## Not Doing (and Why)

- An Integral organization or webhook. Clerk has no second list, and the desktop cannot hold a Management API secret.
- A stored Logto session. Offline use would start depending on the cloud account.
- Logto inside the account window. The sign-in page stays in the system browser.
- A client secret in One. A Native app uses PKCE.
- Importing Clerk users. These machines can be reset.
- A separate dev tenant, Business login, and workspace authorization. Those are later work.

## Open Questions

- None that block the desktop gate. Before building, the Logto console needs a first-party Native app named Integral One, the redirect URI `integral-one://account/callback`, and the App ID sent here. Leave secrets out of chat and out of the repo.
