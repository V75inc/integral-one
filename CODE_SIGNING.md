# Code signing policy

**Apple Silicon development distribution uses V75 Inc. Developer ID signing and Apple notarization. Windows Foundation approval is not claimed.**

V75 Inc. maintains Integral One. We are investigating free Windows code signing
through SignPath Foundation. No sponsorship, certificate allocation or service
approval is claimed. If accepted, the Foundation's certificate would identify
SignPath Foundation as the Windows publisher. The Apache license and V75 Inc.'s
maintainer role would remain unchanged.

## Source and release approval

Official candidates must be built from reviewed public source and pinned,
inventoried dependencies. Private Integral Business code is excluded. Preserve
Apache and component notices in source and packages. Record the source revision,
native runner, artifact hashes, signing identity and qualification evidence.

Eldon Marks is the product owner. Source maintainer/reviewer permissions, MFA
enforcement and the named signing approver must be confirmed before the SignPath
application states compliance. Every production signing request requires human
approval under the provider's policy. Never grant release credentials to an
untrusted contribution build or run arbitrary PR code with signing access.

The manual Windows development workflow builds unsigned artifacts without signing
secrets. They are internal candidates and do not pass the public installer
bootstrap. The signed-candidate workflow does not publish releases; public release
publication is a separately authorized operation.

## Independent Core runtimes

One 0.1.9 introduces separately qualified Core/UI runtime payloads. These ZIPs and
manifests are not Developer ID signed or notarized. Their trust boundary includes
HTTPS, the fixed PyPI/TestPyPI and V75 GitHub authorities, protected release access,
exact upstream provenance and download/file hashes. The desktop independently
compares engine/metadata/license bytes against the published upstream wheel and
checks the composed UI inventory before staging. Hashes do not independently
authenticate a publisher if a release authority is compromised.

Runtime files reside in the private user-data directory and run through the
reviewed bundled launcher. They do not modify the signed app bundle. Qualification
and runtime publication do not use native signing keys. Compatibility, consent,
backup and failed-trial recovery are described in
[automatic updates](docs/AUTO-UPDATES.md). Installed 0.1.8 needs a signed host
upgrade before it can use this lane.

## Verification and continuity

The public bootstrap checks release hashes and valid operating-system publisher
signatures. Mac apps also require notarization acceptance. Windows installer and
application signatures must match the approved signing identity and pass native
qualification. Foundation integration, if approved, must replace the current
V75-specific signing expectation through a reviewed change, without weakening
signature checks. Do not tell users to disable OS protections.

Preserve `ai.integral.desktop`, the `Integral` data directory and existing recovery
keys. Signatures establish publisher/artifact provenance; they do not establish
source licensing authority or isolate executable extensions. Updates must retain
local records and account-independent offline access.

Read [Privacy](PRIVACY.md), [SignPath preparation](docs/SIGNPATH-APPLICATION.md),
[Windows signing](docs/WINDOWS-SIGNING.md) and the
[release runbook](docs/INSTALLER-RELEASE.md) for current readiness and open items.
