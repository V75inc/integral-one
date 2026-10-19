# SignPath Foundation application preparation

**Status: investigation selected by the owner; not submitted or approved.**
Checked 18 October 2026 against the live application and Foundation terms.
The publisher would be SignPath Foundation; V75 Inc. remains the maintainer and
Integral Core/One remain Apache-2.0. Business remains private and outside the
proposed signed distribution.

## Readiness

| Item | Current evidence / next step |
| --- | --- |
| Public source | Source is published on `codex/one-foundation` in [draft PR #1](https://github.com/V75inc/integral-one/pull/1). Default `main` still contains the initial license until review and merge; do not present the import as merged |
| Downloadable release | GitHub currently lists no releases. Prepare a traceable Windows candidate and clarify the Foundation's prior-release prerequisite before promising a release date |
| Reputation | This is a new distribution. Provide genuine project history, upstream contribution history and usage evidence if available; do not invent adoption or imply approval follows automatically |
| Component eligibility | Review every bundled component and license, including the Electron/Clerk SDK, composed Core wheel, UI overlay and desktop host. The current development artifacts include uncommitted source snapshots; replace them with reviewed, published source and reproducible pins |
| Hosted private service | Current signup calls the separate private account service. Disclose this and the Clerk dependency; ask whether this service boundary and mandatory signup are eligible. No private service code is proposed for the installer |
| Privacy | Preview notice and in-app disclosure are prepared in PRIVACY.md; owner approved support@v75inc.com. Production retention/deletion/processor terms and pre-install disclosure still need completion |
| Signup and opt-out | Foundation conditions address disabling certain data transfers during installation. Mandatory signup needs explicit clarification against those conditions. Do not silently remove signup or assert that the existing offline receipt satisfies an installation opt-out |
| Maintainer controls | MFA compliance and actual source review/signing-approval roles still require confirmation for the signing team. No compliance claim or security-setting change is made by this preparation |
| Signing policy | CODE_SIGNING.md and home/download links are prepared with truthful pending status. Confirm actual roles; add sponsorship attribution only once signing is actually provided |

The source license is compatible in principle; this is not a determination of
eligibility. The Foundation decides whether to accept a project.

## Draft application fields

These are preparation notes, not a submitted form. Confirm the account contact
before sending; no personal details have been entered into the application.

| Field | Proposed value |
| --- | --- |
| Project name | Integral One |
| Repository | https://github.com/V75inc/integral-one |
| Homepage | https://github.com/V75inc/integral-one — use the draft PR/source branch for review until main is updated |
| Download | The repository's Releases page, once a candidate and accurate signing status exist |
| Privacy policy | [Published preview notice](https://github.com/V75inc/integral-one/blob/codex/one-foundation/PRIVACY.md); production retention/deletion terms remain pending |
| Tagline | A local desktop workspace for organizing knowledge and working with AI. |
| Description | Integral One is an Apache-licensed desktop application built on Integral Core. It gives individuals a local workspace for structured records and knowledge, with optional AI assistance. Workspace files and records remain on the user's computer. Official builds use Integral account signup; local access continues offline after setup. |
| Reputation | New distribution preparing its first release. Add verified upstream history and community evidence before submission; no public usage count is asserted |
| Maintainer | V75 Inc. (company); select the matching live form option |
| Build system | GitHub Actions; PR qualification builds an unsigned Windows x64 NSIS artifact. Record the successful run and artifact once it completes; a CI artifact is not a public signed release |
| Account contact | Eldon Marks; confirm the intended business email before submission |
| Discovery | AI assistant / ChatGPT, if that matches the available form option |

## Questions to resolve with the Foundation

Prepare these for the eligibility discussion; nothing has been sent:

A [ready-to-review inquiry](SIGNPATH-ELIGIBILITY-INQUIRY.md) contains the published
source/privacy links and exact account/service boundary. It is not an application
or a sent message.

1. Does an Apache desktop application with mandatory initial Clerk signup,
   account-only adoption counts and indefinite offline local access meet your
   privacy/opt-out conditions? What installation choice would be required?
2. Is a separately hosted private registration/receipt service acceptable when
   its code is absent from the signed desktop package?
3. What release and reputation evidence is sufficient for a new distribution
   built on an existing public Core project?
4. How should our Electron executable, NSIS installer, bundled upstream binaries
   and composed Core artifacts be represented in the approved artifact policy?

## Integration after approval

Use Foundation-managed signing of provenance-verified CI artifacts with human
approval, following their assigned project configuration. Review nested app and
installer signing together. A signature on the outer installer alone does not
satisfy our bootstrap's installed-application signature check.

The current certificate-store build path and Windows manifest checker are for a
V75 Inc. certificate; **they are not a SignPath integration**. After approval:

- Implement the assigned signing workflow with narrowly scoped permissions and
  protected approval; pin the reviewed signing action/version.
- Replace the V75-specific publisher expectation with the approved Foundation
  certificate identity. Keep exact thumbprint, signature and timestamp checks.
- Generate the manifest from the returned signed bytes, checking both the
  installer and packaged application. Requalify updates and publisher continuity.
- Keep Business artifacts out of Foundation signing. Preserve all source and
  component notices; do not treat a signature as a licensing clearance.

No Foundation credentials, project ID, approved artifact policy or signing
workflow exists yet. The unsigned Windows development workflow remains useful
for native engineering; its artifacts are not public trusted installers.

## Next sequence

1. Review the published substantive One [draft PR #1](https://github.com/V75inc/integral-one/pull/1).
2. Complete PR qualification, including the unsigned Windows installer artifact.
   Preserve its source revision, run, digest and native qualification evidence.
3. Resolve privacy, roles and eligibility questions; prepare the public policy
   and actual release evidence without claiming sponsorship prematurely.
4. Complete the application. Its agreement and personal-data consent require
   owner review at submission; optional marketing consent is not needed.
5. After approval, implement their signing configuration and qualify the complete
   Windows download/install/signup/offline/update/recovery path.

## Evidence currently available

- [Draft PR #1](https://github.com/V75inc/integral-one/pull/1) publishes the source
  and documentation for review. The default branch remains a separate merge gate.
- GitHub Actions runs the Linux, macOS and Windows qualification matrix on the
  draft PR. Early clean-runner failures are being fixed; record only the current
  head's actual result and artifact digest as successful evidence.
- Core's public GitHub repository was created 15 September 2026; the API reported
  three forks and zero stars during this check. These are modest project-history
  facts, not proof of widespread use. No stable GitHub release was returned by
  the Core latest-release API. Do not invent release/download statistics.
- An internal CI artifact alone does not close the Foundation's prior-release
  condition. Obtain guidance before presenting it as an accepted substitute.

References: [Application](https://signpath.org/apply),
[Foundation conditions](https://signpath.org/terms.html),
[Windows preparation](WINDOWS-SIGNING.md), [release gates](RELEASE-GATES.md).


### Runtime-composition follow-up

A subsequent local candidate moves the native host source into One and adopts
Core's neutral local/hosted runtime contract. It is not yet the public PR head.
Rebuild and record an unsigned Windows artifact from the eventual published
candidate; the earlier foundation artifact cannot qualify changed source.
