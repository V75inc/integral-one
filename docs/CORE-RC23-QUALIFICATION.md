# Integral One: published Core rc23 qualification

Date: 18 October 2026. This replaces the development Core snapshot in PR #1.
Historical snapshot results remain in `RUNTIME-COMPOSITION-QUALIFICATION.md`.

## Pinned upstream release

- Core version/tag: `0.1.1rc23` / `v0.1.1rc23`.
- Source: `42c9d84f0ce74bd9ae4383114d6dc3d92c0c0c54`.
- Base wheel SHA-256: `0434e2cf0f93e1a0e65142b990a62781ff916be64877936f75de4269c7a94930`.
- [Exact-main CI](https://github.com/V75inc/integral-core/actions/runs/39186575232)
  and [publication/artifact gates](https://github.com/V75inc/integral-core/actions/runs/39188373262) passed.
- The downloaded wheel matches TestPyPI's hash; all 764 packaged Python files
  match the release source. Bundled web/resident assets and original LICENSE/NOTICE
  are present. The frontend source inventory is unchanged from the qualified
  composition candidate; its manifest now identifies the release commit.

## Local results

| Gate | Result |
| --- | --- |
| `npm run verify` | 39 Node and 3 Python tests passed; artifact/notice/identity checks passed |
| `npm run test:host` | 32 passed |
| Composed UI | Build/types and all 1,888 tests passed (332 files, one worker) |
| `npm run build:runtime` | Released engine with One UI composed; backend/license bytes preserved |
| `npm run build:accounts` | Passed |
| `npm run qualify:runtime` | Fresh temporary home, local descriptor and native controller session passed |
| Unsigned macOS arm64 package | Build/inspection passed; Apache notices present; internal files excluded |

An initial UI command supplied the worker option twice and was rejected before
executing tests. The corrected direct UI command passed; no test threshold or
assertion was changed. Native Windows/macOS/Linux CI must pass on the final pushed
head; its run and artifact identities are recorded in PR #1.

## Preservation and release boundary

No account/signup/offline implementation, host overlay, app ID, data path,
installation/owner/workspace identity or recovery/receipt key is changed by this
release-pin update. Qualification uses new temporary homes; no real store is reset
or migrated. Core and One keep Apache licenses and inherited notices.

This qualifies the source/runtime integration. Production Clerk/provider/domain
callbacks, privacy/component/IP clearance, SignPath eligibility, signed installers,
Apple notarization and clean-machine GUI acceptance remain the independent gates
in [RELEASE-GATES.md](RELEASE-GATES.md). No public installer is published here.
