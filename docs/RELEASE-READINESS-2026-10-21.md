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
| Signed runtime integrity | Fixed: the native signer verifies the approved input, signs the launcher, refreshes its hash before the outer app seal, then verifies the final app. Real ad hoc signing and package inspection pass; the wheel is unchanged | Qualify Developer ID signing/notarization and downloaded artifacts on supported Macs |
| Core publication updates | Owner selected complete tested One releases. Registry polling, exact tagged-source/wheel/notice verification, native candidate matrix and source-PR workflow implemented. Live rc28 publication replay verifies all 776 packaged Python files and refreshed pins | Merge this workflow to activate scheduling; each new Core publication must pass its actual native matrix before an update PR is created |
| Existing-store replacement | Real rc23 → rc28 app-style replacement retains the App/Track/record, installation keys, local setup binding and owner session after a cold backup | Repeat against each new Core version; signed A → B application replacement remains separate |
| Installer protection | Repository permits bot PR creation. Configured desktop-release with eldonm as required human reviewer, main as its only permitted branch, and the reviewed public production account variable. Core pin changes on main automatically start protected candidate preparation | No repository/environment signing secrets are configured. Provision approved signing material and qualify the exact artifacts; no public release is created automatically |
| Runtime launcher | uv 0.13.4 replaces 0.11.3 in all native jobs and bundle validation; the packaged upstream MIT notice is byte-identical | Rebuild and inspect each platform's final signed runtime |
| Windows | No SignPath grant/certificate; no public Windows installer | Complete application/eligibility, approved signing integration and native QA |
| Privacy/rights/brand | Prepared owner decision package | Owner/legal evidence and approved public disclosures |
| Publication | Core [#165](https://github.com/V75inc/integral-core/pull/165) passed CI and merged. Version-bump [#166](https://github.com/V75inc/integral-core/pull/166) remains open for rc29; no rc29 tag/publication exists at this checkpoint. One [#2](https://github.com/V75inc/integral-one/pull/2) carries source preparation | Publish a reviewed Core artifact containing the fixes, refresh One pins through the new preparation flow, complete One source review and obtain final installer approval |

Local logs and JSON evidence are in `.local/verification/release-readiness/`.
They are excluded from the application and public import. Public source docs
summarize results without credentials, user profiles, tokens or private account data.

## Source review checkpoint

The source PR preserves the rc28 pin and records its known limitations. A fresh
temporary-home probe opened the native controller session, then received HTTP
403 for timezone, pinning and model-credential writes. These local settings
remain blocked until the reviewed Core transport fix is released and composed
into One. Passing host/account tests do not qualify those application flows.

Fresh source checks pass: 84 Node tests, 16 Python tests, 34 desktop-host tests,
the UI production build/type check and all 1,960 UI tests. The production
dependency-closure check inspected 3,695 modules and excluded all four
advisory-bearing packages. Fresh composed-runtime startup and the native
controller session pass in a temporary home. The originally failing ad hoc
signing probe now passes with the signing-order correction, and the same native
qualification is part of ordinary macOS CI. It is not Developer ID/notarization
or a signed two-version updater acceptance test.

This PR is release preparation. It does not publish an installer, enable the
unsigned preview's updater, deploy account infrastructure or clear the signed
installation, update, recovery, privacy and component-review gates.

See [Clerk-only setup](CLERK-ONLY-SETUP.md), [prepared decisions](RELEASE-DECISIONS-DRAFT.md)
and [installer runbook](INSTALLER-RELEASE.md).
