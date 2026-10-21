# Integral One 0.1.1 release preparation

Worktree: `codex/release-readiness`, based on public main `a3187f5`.
This is an evidence ledger, not a release approval. No One installer was published.
The owner authorized the source PR, Core #166/#167 merges and governed rc29
publication, and selected Apple Silicon on macOS 14+ for the initial signed
release. Signing-material use and One publication remain separate approvals.

| Gate | Current evidence | Remaining work |
| --- | --- | --- |
| Version/pins | One package, lock and distribution are 0.1.1. Published TestPyPI Core rc29, exact tag `818542e`, wheel SHA-256 `73df3b958043e0146fbdaa3d6622f2a629dac38037c3ea63b082a9545e145c85`; all 781 packaged Python files and original notices match source. Host remains 0.1.7-dev.4. | Review exact source before tagging One. |
| Core release | #165 settings/decoder fixes, #166 rc29 version and #167 manual-CI recovery are merged. Exact-main CI and governed publication/tag recording passed. | Continue exact-source/artifact gates for later Core releases. |
| Mac platform | Owner selected Apple Silicon/macOS 14+. Cross-target resolution passes there. Intel has no compatible wheel for the required ONNX Runtime; public assembly refuses Intel assets. | Developer ID, notarization and supported-machine qualification. Intel needs an upstream compatibility solution. |
| Mac minimum | Package declares macOS 14.0; actual application metadata is checked. Bootstrap rejects earlier systems before downloading. | Clean-machine acceptance of each advertised OS version. |
| Local runtime | Fresh composed published-wheel startup, local runtime contract and controller session pass. | Final signed application startup. |
| Store replacement | Actual rc28 → rc29 replacement follows a cold backup; App/Track/record, installation identity/keys, local setup binding and owner access remain intact. | Repeat for each Core pin; signed whole-application replacement remains separate. |
| Desktop settings | Published-wheel timezone and App pin writes/readback pass and persist through a cold restart. Invalid model-credential requests reach normal validation rather than profile 403. | Real AI-provider inference/credential and full signed-user journey qualification. |
| Source checks | 87 Node tests, 16 Python tests and 34 host tests pass. Published-tag UI snapshot exactly equals the preflight that passed build/types and all 1,984 UI tests across 343 files. | Exact-head native PR CI. |
| Desktop dependencies | Production desktop npm audit reports zero findings. Earlier root-tooling audit also passed after global-agent 4.1.3; proxy API is tested. | Recheck final release dependency set. |
| Python dependencies | Actual composed runtime's resolved versions exactly match its audited preflight; no known vulnerabilities found. Published rc29 includes Pillow 13, decoder restrictions and the text-only ONNX adapter. | Future pins require fresh audit/compatibility checks. |
| Composed UI | Actual production closure checks 3,698 modules and excludes braces/sprintf-js from browser chunks. Tooling audit remains 5 high/3 moderate propagated findings. Packaged UI hashes and layout utilities pass. | Upstream remediation or reviewed disposition of remaining tooling exposure; build reviewed inputs without release credentials. |
| Native package | Actual macOS ARM package, notices, private-file exclusions, source hashes, macOS floor and runtime hashes pass inspection. | Developer ID/notarization and downloaded ZIP/clean-machine checks. |
| Signing integrity | Real ad hoc signing verifies the original inputs, signs the launcher, refreshes its hash before the outer seal and verifies the completed app. Startup from the signed package resources passes; wheel bytes stay unchanged. | Ad hoc signing does not qualify Gatekeeper, Developer ID or notarization. |
| Updater | Opt-in checks, separate download/restart approvals, public credential-free feed and verified Core shutdown are implemented. ARM-only feed/SDK selection and Intel rejection are tested. | Signed A → B installation, invalid-download/signature rejection, retained data and first startup on the supported Mac target. |
| Core publication updates | Registry polling, actual wheel/tag/source/notice checks, immutable pins and Linux/macOS/Windows candidate qualification prepare a draft One update PR. Current rc29 was consumed through that same preparation helper. | Merge workflow to activate scheduling; every later publication must pass its candidate matrix before an update PR is created. |
| Credential boundary | Preparation, runtime bundling/probes and package inspection receive a filtered environment; public account settings remain available. Only the final signer/notarizer inherits signing credentials. A regression test verifies the boundary. | Provision/use signing material only with approval. |
| Installer protection | `desktop-release` has eldonm human review, main-only deployment and the public production account variable. Candidate plan resolves native dependencies before requesting signing approval. | Approved signing-material provisioning/use; no signing key was exported or used in this work. No automatic installer publication. |
| Clerk-only setup | Installation-bound token-free local setup record and adversarial tests pass; legacy receipts remain compatible. | Final packaged production signup/return/outage/upgrade qualification. |
| Production account/DNS | V75 Inc / Integral production Clerk instance and onintegral.ai DNS are configured; HTTPS and native bootstrap/callback controls were checked. | Final endpoint/provider/operator/privacy acceptance. |
| Google | Owner-configured production consent and real earlier packaged Mac callback passed; local setup record verified. | Final signed package and returning-account cases. Google's tab may keep spinning after successful app handoff. |
| Microsoft | Owner-configured account-only consent and earlier packaged callback/email verification passed; durable record verifies without a stored JWT. | External/non-admin/personal-account, returning-account and final signed-package checks. |
| Runtime launcher | Reviewed uv 0.13.4 is bundled with its byte-identical upstream MIT notice. | Inspect the final signed runtime. |
| Windows | Dependency resolution passes; prior native CI produced an unsigned rc28 installer. Signed build explicitly stays blocked until signing/updater qualification. | Exact rc29 native CI, approved signing provider and native acceptance. |
| Privacy/rights/brand | Owner decision and disclosure package is prepared; inherited Apache grants and notices are preserved. | Required owner/legal/component evidence and approved public disclosures. |
| One publication | One PR #2 carries source preparation; production bootstrap assets remain unpublished. | Signed installer, update/recovery, account/privacy/component gates and final publication approval. |

## Exact release evidence

- [Core source CI](https://github.com/V75inc/integral-core/actions/runs/39626017941)
  passed on `818542ef29390f4350253808668cb4ab13a1334e`, including both containers.
- [Governed rc29 publication](https://github.com/V75inc/integral-core/actions/runs/39633195204)
  passed source qualification, artifact verification, TestPyPI upload and tag recording.
- [TestPyPI rc29](https://test.pypi.org/project/integral-core/0.1.1rc29/) is the
  consumed channel. The approved policy currently follows TestPyPI prereleases;
  switching to stable PyPI requires a reviewed policy change.

The manual CI recovery run was cancelled when a delayed push run for the same
revision entered its shared concurrency group. The replacement run linked above
completed successfully; the cancelled run is not used as publication evidence.

The older rc28 negative control received HTTP 403 for settings writes. The exact
published rc29 now passes the desktop settings and cold-restart journey. These
checks run before signing, and ordinary native PR CI requires the same settings
admission/retention checks. API validation admission does not claim a real online
AI inference or provider-key acceptance test.

Task-local logs, synthetic homes and JSON evidence remain outside the application
and public source import. Reports contain no account tokens, keys, private user
profiles or operational data. No production data migration, Developer ID signing,
notarization submission or One publication was performed by this preparation.

See [platform readiness](PLATFORM-READINESS.md), [Core release updates](CORE-RELEASE-UPDATES.md),
[auto-updates](AUTO-UPDATES.md) and the [installer runbook](INSTALLER-RELEASE.md).
