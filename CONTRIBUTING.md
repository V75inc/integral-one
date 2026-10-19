# Contributing to Integral One

Integral One and Integral Core are Apache-2.0 projects. You do not need an
Integral account to clone, build, contribute to the source or develop independent
Apps. Account requirements apply to the official distribution/services, not extra
restrictions on Apache source rights.

## Choose the right project

- **One:** installer, branding, native product integration, local onboarding,
  recovery and account/catalog/migration clients.
- **[Core](https://github.com/V75inc/integral-core):** generic graph, API, editor,
  agent harness, permission invariants, SDK/package/transfer contracts and shared
  desktop host. Send generic fixes upstream; do not edit vendored snapshots as a
  second engine/frontend fork.
- **Apps:** domain workflows stay in their own package; see the public Core
  extension contract and reference Apps. Marketplace submission is planned, not
  required for local development.

## Workflow

Start with [developer setup](docs/DEVELOPMENT.md): `npm run setup` installs and builds the checkout. Use a feature branch. Before proposing a change, run `npm run verify` and `npm run test:ui`; for runtime changes, include native readback and applicable unsigned package checks. CI covers three platforms; an unrun job is not claimed as passed.

Use a task-owned `--home`/`--user-data-dir`; preserve real installations and keys.
Keep compatibility identities stable. Include a small reproducible issue, tests,
source/publisher provenance and screenshots where relevant. Maintainers review
security/authorization, local data continuity, compatibility and usability before
merge. AI-assisted contributions require human ownership and verified evidence.

Unless explicitly stated otherwise, intentional contributions are submitted under
Apache-2.0 according to its contribution terms. Submit only work you are authorized
to contribute and retain third-party notices. No copyright assignment or license
change is implied. Private Business code/customer data must not be copied here.
