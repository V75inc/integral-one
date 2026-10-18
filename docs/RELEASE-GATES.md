# Release gates

Core and Integral One are public Apache-2.0 projects by explicit owner decision.
The SUL proposal is retired. Business remains private. Preserve inherited notices
and actual dependency exceptions; provenance does not establish IP assignments.

This source PR prepares a development product and does not qualify a public
installer release. Before production distribution:

- Land and qualify the companion Core contracts and replace the explicitly pinned
  uncommitted development wheel/UI snapshot with an approved upstream release.
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

Migration to Business requires compatibility, backup, explicit upload consent and
an authoritative completion report. It is not background sync. The marketplace, production account-service deployment, paid commerce and Business migration are not shipped by this source import. The account client and private service are development implementations; no production cloud service was provisioned by this preparation.

Fresh macOS development install, account, local record, outage, backup/recovery and icon results are recorded in [FIRST-RELEASE-QUALIFICATION.md](FIRST-RELEASE-QUALIFICATION.md). These results do not remove the production gates above.

The end-user bootstrap and manual signed-candidate workflow are prepared; see [installer release](INSTALLER-RELEASE.md). They have not been published or qualified against a complete signed release. Never present the source `npm run setup` command as a lay-user installer.
