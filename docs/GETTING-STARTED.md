# Getting started

Integral One is your personal, local desktop workspace. This guide describes the development preview; signed public installers are still being prepared.

## 1. Open Integral One

Use the [one-command installer](INSTALL.md) when the signed public release becomes available. It downloads and installs the app and opens signup without developer prerequisites. Building from source is a separate [contributor workflow](DEVELOPMENT.md).

The first setup needs internet for account signup and runtime downloads. Allow time for the workspace to prepare. After setup, local work can continue offline.

## 2. Sign up or sign in

Choose Google, Microsoft or email, according to the connections enabled for your build. Verify your email if asked. Social sign-in opens your system browser and returns to Integral One. Setup finishes automatically—there is no separate activation button.

The current production account configuration is not yet available. Development builds require a maintainer-provided configuration; Microsoft’s live return flow still needs qualification.

## 3. Create your first record

1. Open **Apps** → **Manage apps** → **Create blank app…**.
2. Name the App and choose **Create**.
3. Open the App and choose **New track**.
4. Keep **None / Default**, choose **Next**, name the Track and create it.
5. Open the Track, choose **New Post**, enter your title and details, then choose **Post**.

An App groups related work. A Track holds related records. You can edit a record from its actions menu and find it again using the Track's search field. No AI provider is required for these steps.

## 4. Add AI when you want it

Open **File → Set Up AI Model…** or the AI models section of Settings. Configure a supported local model or your own provider credentials. Local model availability depends on your computer and installed model runtime; a hosted provider may require internet and a paid provider account.

## Accounts and offline access

Your Integral account identifies you to Logto at https://auth.saas.apps.trueselph.com/oidc. Your local files stay local. This tenant’s user list includes dev signups. Choosing a hosted AI provider is a separate data flow: prompts and selected context go to that provider.

**Sign out** returns to the welcome screen. **Sign in** opens the system browser. **Continue offline** does not contact Logto. A different account does not replace the link.

Sign-out is not a lock against another person using the same operating-system account. Protect the computer with your OS account, screen lock and disk encryption.

## Keep your work safe

Quit Integral One before a supported cold backup. Preserve the installation data, encryption keys and `one-account` receipt together. The current backup/restore route uses the Core CLI and requires an authorization review after restore; it is not yet a one-click desktop feature. See [data compatibility](DATA-COMPATIBILITY.md) and [troubleshooting](TROUBLESHOOTING.md).

## What comes next

The marketplace and the Business upgrade path are planned. Your shared Integral account is intended to make a later upgrade straightforward. Records will not be uploaded or transferred without an explicit migration flow and your consent.
