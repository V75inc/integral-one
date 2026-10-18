# Foundation PR qualification — 18 October 2026

## Scope

Local branch `codex/one-foundation` is based on the public repository's initial
Apache license commit. This report covers the prepared initial source import.
No source branch/PR, registry artifact or product release was published during
preparation. This is a reviewable development foundation, not a signed release.

The native host and generic UI/engine are pinned Core dependencies. The Core base
commit plus uncommitted development snapshot and artifact hashes are recorded in
`distribution.json`, `vendor/core-ui-source/core-source.json` and
`docs/SOURCE-PROVENANCE.json`. The wheel is not the public registry rc21 build.
A companion Core change/release must land before production use of this snapshot.

## Local evidence

| Area | Evidence |
|---|---|
| Source and artifacts | Reviewed host/wheel/UI manifest and every inventoried source file verified; extra files, traversal, changed pins and symlinks rejected. |
| Product contracts | 34 Node tests and three wheel composition tests pass (includes new Clerk/receipt/SDK contracts). |
| Branded UI | Production build/type checking; 1,876 tests across 329 files pass, including two edition-brand tests. Final supported Node 24 run recorded with preparation evidence. |
| Core companion | All 16 substrate guards pass using a temporary staged index; neutral Logo tests (3), type check, shared-host tests (27), reference desktop tests (29), source-composition tests (3) pass. |
| Real wheel composition | 823 non-UI engine/metadata/license members are byte-identical to the reviewed base; branded static UI, composition notice and RECORD are regenerated. |
| Unsigned macOS arm64 package | Runtime installation and descriptor checks pass; package inspection confirms single-user profile, matching wheel/uv digests, notices and required host/entry point. Internal evidence/source-only files excluded. |
| Native synthetic installation | Owner session, ready probe, one workspace, declarative App installation, manual record creation, startup audit entries and record readback pass. Full quit/restart preserves local data. No AI provider required. |
| HTTP boundary | Thirteen live positive/negative checks cover controller authentication, denied signup/login/collaboration/public share/ownership flow, hostile Origin/Host and authorized local read. |
| Source publication hygiene | Local screenshots/setup evidence, credential-bearing runtime homes and generated builds are ignored; source and wheel checked for local paths, key/environment files and database dumps. This is not an IP assignment or complete third-party license clearance. |

Earlier Core engineering qualification recorded 6,772 backend passes/100 skips,
smoke/Core-only lanes and PostgreSQL desktop contracts. Those earlier results
were reviewed, not rerun as the full backend suite in this branding/source-import
pass. Neither a completed aggregate `make verify` nor remote CI is claimed here.

## Dependency results

After the compatible Core parser override to 7.1.6:

- Desktop tooling: eight moderate findings; no high/critical findings.
- UI dependency tree: five high and three moderate findings; no critical findings.
- These counts include propagated parent packages. The remaining families are
  braces and sprintf-js, with no patched registry release found at review time.

Read [DEPENDENCY-REVIEW](DEPENDENCY-REVIEW.md) for paths, official advisories and
release disposition. Functional passes do not mean a clean security audit.
The UI build also reports existing large-chunk/code-splitting warnings.
Product-owned staged files pass `git diff --check`. Eleven inherited Core UI
snapshot files retain a final blank-line warning; their exact inventoried bytes
are preserved instead of silently editing vendored source.

## Open gates

See [RELEASE-GATES](RELEASE-GATES.md): Clerk signup and automatic registration are implemented and development-qualified;
production setup, Microsoft provider callback and complete offline/recovery qualification remain open; signing/notarization, other-platform native/clean-machine/upgrade/recovery,
remote CI, independent Core release gates and full artifact license inventory are
not qualified. The account service/portal are implemented locally; no production account deployment, marketplace, Business migration or sync service is claimed. Business private code and real user data are absent.

## Clerk/signup follow-up

See [CLERK-INTEGRATION](CLERK-INTEGRATION.md) for the current account implementation
and live development results. Signup completes automatically; there is no separate
activation action. User-confirmed domain: onintegral.ai; planned shared account
portal: accounts.onintegral.ai. This supersedes earlier Cognito/planned-only status.

### Account display and return sign-in qualification

The full composed Core UI suite passed 1,876 tests in 329 files. A further
three DesktopAccessPage tests pass for native sign-in, explicit offline
reopening, and browser denial of native authority. One's 34 Node and three
Python tests pass, including signed profile validation, account-subject
replacement rejection, and sign-out/offline state persistence. The neutral
desktop host passes 27 tests; the private registration service passes 14.
Signed profile display preserves the internal installation owner. Production
rollout remains gated as described in CLERK-INTEGRATION.md.

Native macOS follow-up passed: signed-out cold restart showed Clerk sign-in;
the approved Gmail returned via the browser callback; the workspace displayed
its verified name/email. A subsequent Sign out showed the desktop return page,
and its Sign in button reopened Clerk. With the registration service stopped,
Continue offline reopened the same local workspace and retained the displayed
profile. Development registration totals remained three accounts, not a new
count for every sign-in. Screenshots and proof are retained locally outside
public source. The final profile mapping preserves a locally customized display
name and uses the signed name only for the initial Owner placeholder.

## Fresh installation qualification

See [FIRST-RELEASE-QUALIFICATION.md](FIRST-RELEASE-QUALIFICATION.md) for the extracted macOS ZIP, fresh signup, local CRUD, sign-in, offline restart, backup/recovery and theme-contrast results. Public release remains blocked by the listed production, dependency and platform gates.
