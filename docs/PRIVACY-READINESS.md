# Privacy readiness before public account launch

The [preview notice](../PRIVACY.md) is implementation-based documentation, not
approved production terms. No new checkbox or activation step is required by
this preparation. Signup remains required for official fresh setup, with local
offline access independent of recurring cloud authorization.

| Decision / evidence | Status and responsible party |
| --- | --- |
| Account operator | V75 Inc.; owner confirmed legal name |
| Purposes and minimum data | Configuration v2 uses Clerk authentication, distinct central-directory signup counts and a local display profile; no private registration server, installation inventory or first-One-use marker. Legacy v1 receipts remain compatible |
| Desktop SDK telemetry | Disabled at ClerkProvider; telemetry hosts removed from desktop account CSP |
| Hosted portal parity | Review Clerk Account Portal/provider pages separately from the desktop. The live onintegral.ai/privacy page currently covers website contact and assessment processing, not the new desktop/account flow; its existence is not production One disclosure approval |
| Privacy contact and request handling | Owner approved public contact **support@v75inc.com**. Operator must qualify authenticated access/correction/deletion handling before launch |
| Retention and deletion | Owner/operator to approve account, security-log, support and backup schedules, deletion propagation, exceptions and evidence; do not invent periods |
| Processors and hosting | Production Clerk/service configuration, hosting region, subcontractors, agreements and international transfers require operator/legal review |
| Applicable law and audience | Owner/legal reviewer to establish markets, age/audience rules, lawful grounds and required rights disclosures |
| Installer disclosure | Publish truthful Mac download/account/update disclosures before launch. Windows one-click NSIS lacks a pre-install notice/choice; agree an acceptable presentation with SignPath before any Foundation signing |
| Signup opt-out eligibility | Windows/SignPath-specific gate: confirm how required account signup fits its data-transfer/installation-choice conditions; no exemption is claimed and Windows is optional for the first Mac release |
| User rights vs local access | Online deletion must not remotely delete the workspace or invalidate an existing local setup receipt. Keep historical verification keys available |
| Marketing | No marketing consent inferred from signup; separate future consent and mailing-list processing if introduced |
| Update checks | Native automatic checks are opt-in; disclose public GitHub request/connection data, separate download/restart approvals and the ability to turn checks off |

The in-app notice is available without navigating to a website. The full preview
notice ships in application resources. Production configuration must not be
treated as privacy approval: the human release reviewer must close these items.

References: [SignPath conditions](https://signpath.org/terms.html),
[Clerk privacy scope](https://clerk.com/legal/privacy),
[account plan](ACCOUNT-AND-ECOSYSTEM-PLAN.md).

Live public-page readback on 21 October 2026:
[privacy](https://onintegral.ai/privacy) and [terms](https://onintegral.ai/terms)
are available, but describe the website/readiness assessment. Review the desktop
notice and account operator arrangements before applying them to public signup.
