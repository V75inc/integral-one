# Release gates

Core and Integral One are public Apache-2.0 projects by explicit owner decision.
The SUL proposal is retired. Business remains private. Preserve inherited notices
and actual dependency exceptions; provenance does not establish IP assignments.

This source PR prepares a development product and does not qualify a public
installer release. Before production distribution:

- Retain reviewed Core release pins and rerun source/artifact/native checks for every
  engine update. The published rc29 pin and current consumer evidence are recorded in
  the [release ledger](RELEASE-READINESS-2026-10-21.md); historical rc23 checks
  remain in [rc23 qualification](CORE-RC23-QUALIFICATION.md).
- Resolve or explicitly qualify dependency advisory exposure; see
  [dependency review](DEPENDENCY-REVIEW.md). Passing tests do not clear advisories.
- Review contribution authority, third-party/native runtime, App/model/font
  inventories and package notices; approve any account/privacy/commercial terms.
- Close [privacy readiness](PRIVACY-READINESS.md), including hosted retention,
  authenticated deletion requests, processor arrangements and installer disclosure.
  The preview notice and support@v75inc.com contact are prepared; production terms
  and SignPath signup/opt-out eligibility are not approved by this source PR.
- Confirm brand/trademark/domain rights. No exclusivity is inferred.
- Complete production qualification of Clerk first-use signup, email verification
  and offline setup (development implementation is present). Preserve indefinite local access/export after activation. See the
  [account/ecosystem plan](ACCOUNT-AND-ECOSYSTEM-PLAN.md).
- Complete macOS signing/notarization, supported Windows/Linux/native installer,
  clean-machine, upgrade, recovery and data compatibility qualification.
- Run the independent Core artifact/release gates and the remote CI matrix.
- Qualify the [auto-updater](AUTO-UPDATES.md) with two real signed versions on
  the supported Apple Silicon/macOS 14+ target, preserving account/workspace data and download/restart
  consent. Publish the exact matching feed and verified ZIP. Intel remains blocked by Core runtime compatibility; see [platform readiness](PLATFORM-READINESS.md).

Migration to Business requires compatibility, backup, explicit upload consent and
an authoritative completion report. It is not background sync. The marketplace, production account-service deployment, paid commerce and Business migration are not shipped by this source import. The current signup uses the configured Clerk production directory and an installation-bound local setup record, without a private registration-server launch. Final packaged production account qualification remains required.

Fresh macOS development install, account, local record, outage, backup/recovery and icon results are recorded in [FIRST-RELEASE-QUALIFICATION.md](FIRST-RELEASE-QUALIFICATION.md). These results do not remove the production gates above.

The end-user bootstrap and manual signed-candidate workflow are prepared; see [installer release](INSTALLER-RELEASE.md). They have not been published or qualified against a complete signed release. Never present the source `npm run setup` command as a lay-user installer.


## Runtime composition dependency

Core rc29 supplies reviewed/released artifacts implementing the accepted neutral
local/hosted runtime contract. The pinned source and wheel identities are in
`distribution.json`. Continue to require
local fixed-owner/bootstrap/session and hosted tenant/workspace authorization
proofs, existing-store/receipt compatibility, and One signup/offline/package
qualification. Native host source ownership now belongs to One. An engine update
must not rotate installation IDs, owner IDs, data paths or recovery/receipt keys.
