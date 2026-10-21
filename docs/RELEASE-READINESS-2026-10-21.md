# Integral One 0.1.0 release preparation

Worktree: `codex/release-readiness`, based on public main `a3187f5`.
This is an evidence ledger, not a release approval. No public release exists.
The owner authorized committing and publishing the current One source changes
as a pull request on 21 October; installer publication remains a separate gate.

| Gate | Current evidence | Remaining work |
| --- | --- | --- |
| Stable version | package, lock and distribution set to candidate 0.1.0 | Review before tagging |
| Clerk-only setup | Verified-session/local-record implementation and adversarial tests | Packaged production signup/callback/offline/upgrade qualification |
| Local engine boundary | Published TestPyPI Core rc28 (5d0f605) matches its tag; desktop-host updated locally to 0.1.7-dev.4 for updater lifecycle/menu support; fresh runtime and controller session pass | Final Core fix release/pin, existing-installation upgrade and component disposition remain applicable; rc28 is not on production PyPI |
| Desktop dependencies | Root npm audit: zero findings after global-agent 4.1.3 override; proxy API tested | Recheck exact final package closure |
| Composed UI | Core rc28 production build and all 1,960 tests pass; missing layout CSS in the dependency-check rebuild corrected by restoring Tailwind's working directory; packaging rejects missing layout utilities; rebuilt native Home/Apps verified in dark mode and Apps in light mode | Production module closure excludes all four advisory-bearing packages; unresolved tooling exposure requires upstream remediation or reviewed disposition |
| Local settings | Narrow Core transport fix passes real native PostgreSQL pin/timezone writes, restart retention, identity continuity and unauthenticated/foreign-user/hostile-origin denial in an explicitly local desktopqa build; expanded Core make verify passes, including the seeded-log assertion repair and image guards | Release reviewed Core before updating immutable One pins |
| Auto-updater | Owner chose notification and approval before download/restart; Mac implementation, menu/lifecycle support, combined architecture metadata and 13 updater/metadata tests pass; 34 host tests pass; package inspection and native unsigned-build refusal pass; Google-linked setup/installation files remain byte-identical after warm-cache restart | Signed two-version update, invalid-download/signature and data-retention qualification on Apple Silicon/Intel; exact matching public feed and assets; signed Windows build blocked until its updater/signing qualification |
| Production account instance | Created in V75 Inc / Integral for onintegral.ai | Provider credentials, all selected sign-in paths and operator/privacy qualification |
| Google | Owner saved credentials; approved audience In production; real packaged macOS sign-in completed and local setup record verifies; owner confirmed Google worked | Google's tab can remain spinning after app handoff; user can close it once One opens. Other platforms and returning-account qualification remain |
| Microsoft | Owner saved credentials and approved account-only consent; organization consent stayed unchecked. Packaged Microsoft callback and owner-entered email verification completed; durable production setup record verifies without a stored JWT. Latest updater preview restarts to Home with profile and installation/setup files unchanged | External/non-admin/personal-account, returning online sign-in and publisher/disclosure qualification remain; warm-cache restart is not a whole-machine network outage test |
| Python dependencies | Earlier rc28 runtime audit found Pillow 12.3.0 advisories. Refreshed Core #165 retains main's text-only ONNX adapter and Pillow 13; its backend audit reports no known vulnerabilities, and decoder restrictions pass focused tests and full make verify | Release/pin the reviewed artifact, rebuild One's unchanged rc28 runtime and rerun its audit before claiming packaged remediation |
| DNS | Clerk's five DNS-only CNAME records applied; primary domain Verified; normal Mac HTTPS and live signup now work | Recheck final release endpoints |
| Native API/callback | Native API enabled; approved callback and origin configured; exact-origin native bootstrap returns 200 and negative control returns 400; real Google callback completed | Qualify other selected providers and platforms |
| Session claims | Production verified-email/name session claims accepted by the packaged verifier; verified local setup record exists | Complete remaining email/Microsoft and returning-account checks |
| Apple agreement/credentials | Credentials and Developer ID identity rechecked; no One notarization submission exists | Sign/notarize exact reviewed Mac candidates; assess actual downloaded bytes |
| Signed runtime integrity | A fresh ad hoc signing probe changed the bundled native uv bytes after runtime.json was generated; the wheel hash remained correct, but package inspection rejected the uv hash | Correct and qualify the signing/manifest ordering before a signed release; retain both native signature checks and runtime integrity verification |
| Windows | No SignPath grant/certificate; no public Windows installer | Complete application/eligibility, approved signing integration and native QA |
| Privacy/rights/brand | Prepared owner decision package | Owner/legal evidence and approved public disclosures |
| Publication | Core [#163](https://github.com/V75inc/integral-core/pull/163) merged as 2d6c593c. Core [#165](https://github.com/V75inc/integral-core/pull/165) is refreshed on that main at acb6e8a4, with full local verification and both audit gates passing; fresh CI pending. Version-bump [#166](https://github.com/V75inc/integral-core/pull/166) is open for rc29. The owner authorized the One source PR | Merge reviewed #165 before #166 for rc29 to include desktop fixes; verify the released artifact, refresh One pins, complete One source review and obtain final release approval |

Local logs and JSON evidence are in `.local/verification/release-readiness/`.
They are excluded from the application and public import. Public source docs
summarize results without credentials, user profiles, tokens or private account data.

## Source review checkpoint

The source PR preserves the rc28 pin and records its known limitations. A fresh
temporary-home probe opened the native controller session, then received HTTP
403 for timezone, pinning and model-credential writes. These local settings
remain blocked until the reviewed Core transport fix is released and composed
into One. Passing host/account tests do not qualify those application flows.

Fresh source checks pass: 80 Node tests, 10 Python tests, 34 desktop-host tests,
the UI production build/type check and all 1,960 UI tests. The production
dependency-closure check inspected 3,695 modules and excluded all four
advisory-bearing packages. Fresh composed-runtime startup and the native
controller session pass in a temporary home. The separate ad hoc signing probe
above is a failed release-readiness check, not a qualified signed package.

This PR is release preparation. It does not publish an installer, enable the
unsigned preview's updater, deploy account infrastructure or clear the signed
installation, update, recovery, privacy and component-review gates.

See [Clerk-only setup](CLERK-ONLY-SETUP.md), [prepared decisions](RELEASE-DECISIONS-DRAFT.md)
and [installer runbook](INSTALLER-RELEASE.md).
