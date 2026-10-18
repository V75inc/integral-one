# Runtime composition qualification

**18 October 2026 · Locally qualified candidate; publication and release pending.**

## Source and responsibility

Core commit: `be5cc5931fd072457831054670939d42121d10a7` on
`codex/runtime-composition`, based on public main `40f29395ccd6e77d69a710c8902dbfe4eca89249`.
One composes this candidate through its recorded wheel/UI hashes and owns the
Apache desktop host source at `packages/desktop-host` (version `0.1.7-dev.3`).
Core now exposes neutral local/hosted presets and a protected host-session UI
contract. The native bridge and sign-in/offline return view belong to One.

The bundled rc22-named wheel is an explicitly recorded development snapshot,
not the separately published rc22 patch release consumed by Business. Reviewed source
and a newly versioned Core release must precede production dependency promotion.

## Preserved behavior

- Existing Clerk signup, controller and offline receipt code remains unchanged.
  One still requires initial signup; subsequent local access survives account or
  network outages. Sign-out retains local records and offers sign-in/offline return.
- Application ID, data paths, installation/owner/workspace identifiers, records
  and recovery keys remain stable. A synthetic old-wheel/new-wheel upgrade
  preserved the record and JWT/credential/OAuth/database/controller key hashes.
- The native host checks both the pinned CLI contract and the running API's local
  descriptor before allowing startup; an old or hosted runtime is rejected.
- Apache licenses, component notices and private Business boundaries are preserved.

## Completed local checks

| Check | Result |
| --- | --- |
| Desktop host source | 32 tests passed |
| One distribution/install/account regressions | 36 Node and three Python tests passed |
| Composed One frontend | 1,888 tests across 332 files passed; TypeScript/Vite build passed |
| Pinned runtime startup | Actual bundled runtime boot, local API contract and native controller session passed |
| Unsigned macOS arm64 package | Built and inspected for contract, provenance, notices and excluded internal files |
| Core default backend | 6,827 passed; 100 skipped |
| Core CI-faithful smoke | 1,955 passed; 26 skipped (initial candidate; current-head remote CI pending) |
| Real PostgreSQL local/hosted authority contracts | 38 passed |
| Public extension contracts on PostgreSQL | 57 passed |
| Core frontend | 1,882 tests passed |
| Core integrity gates | 16 guards, pinned lint/format, mypy, core-only boundary and four composition tests passed |
| Core wheel | Isolated import passed; repeat builds byte-identical |
| Managed hosted API | Two accounts with private records; foreign workspace/record requests denied; local controller unavailable |

`npm run qualify:runtime` reproduces the bundled startup/session check in a
fresh temporary home and removes that home after a successful stop. CI now runs
this check on the native Windows, macOS and Linux jobs. It does not contact Clerk
or count a signup. Private logs and synthetic fixtures remain under `.local/`.

## Scope and remaining gates

The current local candidate has not yet received remote CI. Earlier green checks
on draft PR #1 and earlier unsigned artifacts do not qualify this candidate.
Windows/Linux installer behavior and a fresh live Clerk social-provider callback
were not rerun locally. The unsigned Mac package is artifact evidence, not a
signed installer or an installation/GUI acceptance test.

Core's exploratory JSON extension run completed 22 checks before an existing
long traversal was interrupted; all 57 selected contracts passed on PostgreSQL.
Opt-in domain-App baseline failures remain outside the default Core gate. See
Core's dated runtime qualification record for commands and these limitations.

Production Clerk/domain/privacy configuration, dependency and full component
license review, approved Core release pins, signed installers, Apple notarization
and SignPath eligibility/approval remain independent release gates. This work did
not deploy an account service, use signing keys, submit an application, migrate a
real user store or approve release.

## Rebase follow-up

The candidate now includes rc22's API-timeout and chat-continuation patches.
The full backend rerun is clean after stabilizing an inherited worker test that
used a 150ms real lease; lease loss is now injected only after handler admission.
All 29 worker tests pass; production worker behavior is unchanged. Core's dated
record retains the initial failure (6,826 passed, one failed) and clean rerun.
The 38 authority and 57 extension PostgreSQL contracts, managed data/key upgrade,
hosted tenant denials, reproducible wheel/import proof and frontend were rerun.
One's 36 Node/three Python checks and bundled startup/session check pass again.

No fresh live social-provider callback or real user installation migration was
performed. Current-head remote matrix results will be linked from the paired
PRs; previous-head green checks do not qualify these changes.

Final unsigned macOS arm64 ASAR SHA-256: `cecd717742937db35792af5198929c4ee68ed75fbfc080af67635b59ba5b69af`. Signing is not qualified.
