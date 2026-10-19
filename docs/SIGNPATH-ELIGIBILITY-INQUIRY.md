# SignPath eligibility inquiry — prepared, not sent

Use this short inquiry to resolve the remaining policy questions before submitting
an application that asserts compliance. Do not claim sponsorship or an existing
public signed release. The actual source is visible in
[draft PR #1](https://github.com/V75inc/integral-one/pull/1); main is not yet updated.

## Draft message

Subject: Integral One — eligibility before first Windows signing application

Hello SignPath Foundation,

V75 Inc. maintains Integral One, an Apache-2.0 desktop knowledge workspace built
on our public Integral Core project. We are preparing our first Windows x64 NSIS
release and would like to establish eligibility for Foundation signing.

Source for review: https://github.com/V75inc/integral-one/pull/1

Preview privacy notice:
https://github.com/V75inc/integral-one/blob/codex/one-foundation/PRIVACY.md

Pending code signing policy:
https://github.com/V75inc/integral-one/blob/codex/one-foundation/CODE_SIGNING.md

The desktop source and bundled dependencies are open source; our separate future
Business product remains private and is not included in the signing proposal.
The desktop uses Clerk for user-initiated email/social signup. Official initial
setup requires an account and records a first-registration marker to count unique
accounts. The current registration endpoint is a separately hosted private service;
it returns a signed local setup record. Workspace files and records remain local,
optional desktop SDK telemetry is disabled, and subsequent local access continues
offline without a recurring account authorization check. Optional hosted AI sends
the request context to the provider the user chooses.

Could you clarify:

1. Whether this account requirement and separately hosted service are eligible,
   and what installation disclosure or opt-out your privacy condition requires.
2. What prior-release and reputation evidence you require for a new distribution;
   would a public unsigned Windows preview with verifiable CI provenance suffice
   before its first signed release?
3. How your artifact policy should cover the Electron executable, nested binaries,
   NSIS installer and included upstream runtime components.

We will confirm the maintainer/reviewer/approver roles and MFA compliance before
an application, complete the component and production privacy review, and provide
the exact Windows CI run and artifact when qualified. We understand the
certificate publisher would be SignPath Foundation and approval is discretionary.

Thank you,
Eldon Marks / V75 Inc.

## Submission notes

- No message has been sent. The repository preparation request does not authorize
  contacting the Foundation or accepting its agreement.
- Do not include app-specific passwords, signing credentials or private service
  source. Share only public review links and the approved description above.
- The Windows PR artifact is a short-lived development candidate, not proof that
  a public release or clean-machine qualification already exists.
- Do not change mandatory signup or grant new repository/signing access to resolve
  these questions without a concrete reviewed implementation and owner decision.
