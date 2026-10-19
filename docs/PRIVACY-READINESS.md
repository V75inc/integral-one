# Privacy readiness before public account launch

The [preview notice](../PRIVACY.md) is implementation-based documentation, not
approved production terms. No new checkbox or activation step is required by
this preparation. Signup remains required for official fresh setup, with local
offline access independent of recurring cloud authorization.

| Decision / evidence | Status and responsible party |
| --- | --- |
| Account operator | V75 Inc.; owner confirmed legal name |
| Purposes and minimum data | Authentication, first-registration counts and local display profile; reviewed against One and the current private registration-service code |
| Desktop SDK telemetry | Disabled at ClerkProvider; telemetry hosts removed from desktop account CSP |
| Hosted portal parity | Private service/portal not changed by this PR. Disable optional telemetry, add notice and review provider flows before deployment |
| Privacy contact and request handling | Owner approved public contact **support@v75inc.com**. Operator must qualify authenticated access/correction/deletion handling before launch |
| Retention and deletion | Owner/operator to approve account, security-log, support and backup schedules, deletion propagation, exceptions and evidence; do not invent periods |
| Processors and hosting | Production Clerk/service configuration, hosting region, subcontractors, agreements and international transfers require operator/legal review |
| Applicable law and audience | Owner/legal reviewer to establish markets, age/audience rules, lawful grounds and required rights disclosures |
| Installer disclosure | Current one-click NSIS bootstrap lacks a pre-install notice/choice. Publish truthful download disclosure and agree an acceptable install presentation with SignPath before Foundation signing |
| Signup opt-out eligibility | Ask SignPath how required account signup fits its data-transfer/installation-choice conditions; no opt-out or exemption is claimed |
| User rights vs local access | Online deletion must not remotely delete the workspace or invalidate an existing local setup receipt. Keep historical verification keys available |
| Marketing | No marketing consent inferred from signup; separate future consent and mailing-list processing if introduced |

The in-app notice is available without navigating to a website. The full preview
notice ships in application resources. Production configuration must not be
treated as privacy approval: the human release reviewer must close these items.

References: [SignPath conditions](https://signpath.org/terms.html),
[Clerk privacy scope](https://clerk.com/legal/privacy),
[account plan](ACCOUNT-AND-ECOSYSTEM-PLAN.md).
