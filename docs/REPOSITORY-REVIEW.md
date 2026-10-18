# Integral One source-import review

**18 October 2026 · Scope: draft foundation PR, not production release clearance.**

Reviewed product-owned account, packaging, installer, provenance and documentation
code, with archive/inventory checks on pinned Core dependencies. The imported
Core UI contains over 200,000 lines; this review does not claim a new line-by-line
audit of every inherited component. Generic Core changes remain upstream work.

## Changes made during review

| Finding | Resolution |
| --- | --- |
| Desktop account SDK telemetry permitted despite minimal tracking goal | Set ClerkProvider telemetry to false; remove telemetry endpoints from account CSP. Necessary authentication/security requests remain |
| Damaged signed-out receipt could hide/block local recovery | Expose recovery separately from trusted offline receipt use; explicit existing-workspace recovery opens only this process without replacing the damaged state or trusting its profile. Added regression coverage |
| No bundled privacy notice / public account contact | Add preview privacy notice and expandable signup disclosure; owner approved support@v75inc.com. Keep signup automatic with no new activation/consent gate |
| uv runtime notice omitted | Ship upstream MIT notice, pin bundled uv to reviewed 0.11.3, inspect packaged notice |
| Bundled dependency notices not inventoried together | Collect installed npm notice texts and Electron/Chromium notices into resources, with inventory and package inspection |
| Windows release verification checked installer alone | Require approved thumbprint, valid timestamped app/installer signatures and matching executable version. Existing V75 expectation is explicitly pending replacement if SignPath approves |
| Apple signing blocked Windows engineering | Separate unsigned native Windows candidate workflow; no signing secrets or public manifest |
| SignPath sponsorship could be implied prematurely | Add truthful pending code signing policy, application draft and explicit eligibility questions |
| Inherited Vite preview auto-discovers neighboring private Business pages | Composition sets an explicit empty One-owned public directory in generated local build configuration; pinned Core source is unchanged. The inherited hook serves dev/preview only, not production bundles |

## Security and privacy boundaries checked

- Account IPC checks the dedicated window, main frame and account origin; assets
  use a fixed allowlist. Core receives neither Clerk bridge nor service secrets.
- Configuration accepts only public fields and pins Clerk origin/key and receipt
  verification keys. The submitted registration body contains the random
  installation ID; workspace records/files are not part of that request.
- Receipt verification checks signature, issuer, subject, audience, installation
  and profile shape. No expiry or online lookup gates an established local start.
- Re-sign-in cannot silently bind a foreign account to an existing trusted
  receipt. Explicit local recovery is not a cloud login or account reassignment.
- Signup has no marketing opt-in inference. Shared future Business identity does
  not grant workspace authority or trigger a data upload.
- Publication scan covered 2,513 text members in indexed/nonignored source and
  vendored archives, with zero private-key/live-Clerk-secret/GitHub-token/AWS-key
  pattern hits. This is a bounded pattern scan, not exhaustive secret detection.
  Generated configuration, qualification homes and credentials remain ignored.

## Licensing and component review

Apache LICENSE/NOTICE and inherited provenance are retained. The desktop host
archive includes its source, license and notice. Core's wheel retains its license
and notice; the composed UI does not replace its engine. This is still an explicitly
identified development snapshot, not an approved upstream release replacement.

Both lockfiles declare license metadata for all enumerated packages (390 desktop,
840 Core UI). Declarations include permissive, MPL and asset terms; no claim that
all components are Apache is made. The current installed notice inventory covers
1,169 packages, including build-only dependencies. Ninety installed entries lack
a top-level license/notice file; their metadata is recorded, but the relevant
runtime closure and upstream obligations still need per-component review.
Native/Python, fonts/assets and contribution authority remain production gates.
Provenance alone does not establish an IP assignment.

Fresh npm audit: **8 moderate desktop findings; 5 high and 3 moderate UI findings**.
See [dependency review](DEPENDENCY-REVIEW.md). Functional tests do not clear them.
Do not expose signing credentials to unreviewed dependency/contribution builds.

## Evidence and limits

Evidence files are retained privately under `.local/verification/repo-review/`.
The package built for this review is unsigned and uses unconfigured preview
accounts, not a production sign-in or Windows-install qualification. Its inspection
checks privacy/signing documents, notices, pinned Core runtime and excluded
internal files. Existing live macOS development signup/offline evidence remains
in [first-release qualification](FIRST-RELEASE-QUALIFICATION.md).

There are eleven inherited extra-blank-at-EOF whitespace warnings inside the
integrity-pinned UI snapshot. Preserve that exact snapshot; product-owned staged
files pass whitespace checks. No vendor normalization or hash refresh is included
merely to remove those import warnings.

The completed local checks are:

| Check | Result |
| --- | --- |
| One verification | 35 Node tests and 3 Python composition tests passed |
| Composed UI regression suite | 1,879 tests across 330 files passed |
| Fresh UI composition / TypeScript / Vite build | Passed; generated public-page root selects the empty One directory |
| Native unsigned macOS arm64 package | Built and inspected with privacy/signing documents and collected notices; no signing key used |
| Desktop and UI dependency audits | Completed with the unresolved findings listed above |

Remote
CI, Windows clean-machine behavior, Foundation integration, actual production
signup, dependency clearance and signing/notarization are separate gates.

## SignPath application readiness

**Prepared for owner review; not ready to assert full eligibility.** Publish the
reviewed source before applying. Confirm prior-release/reputation evidence,
private account-service eligibility, required-signup/installation-choice handling,
MFA and actual signing roles. Finalize privacy retention/deletion/processor terms.
No application, sponsorship or Foundation certificate has been obtained.

See [application preparation](SIGNPATH-APPLICATION.md),
[privacy readiness](PRIVACY-READINESS.md) and [code signing policy](../CODE_SIGNING.md).
