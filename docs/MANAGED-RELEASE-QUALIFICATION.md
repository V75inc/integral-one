# Managed Core: signing and native qualification plan

This is an execution plan and dated readiness record, not publication approval.
The candidate is Core `dcc2c7624ec1018fb34943c82ccdb48950747f5f`, with base-wheel
SHA-256 `cb0aa016b7c34f580eafc32ae99d1314a8ee9a422b0e9ac7564fba86d5c4d142` and
composed-wheel SHA-256
`c3418927a14506be7a1fee0998a5aef24987e97dbd548a52bf0300d937a05689`.
It is unpublished. Keep the final Core pin and new One release version pending
until the release owner selects and verifies the published artifact. Do not reuse
the already shipped host version for a payload requiring the new migration code.

[AGENTS.md](../AGENTS.md) says: “No deployment, signing-key use, remote visibility
change or production data migration is implicit in development work.” Steps that
use a real signing identity, notarization credentials, protected workflows or
production accounts require their separate owner authorization. Do not change
security settings or approve older runs while following this preparation plan.

## Readiness checked on 15 November 2026

| Gate | Evidence | Remaining limit |
| --- | --- | --- |
| Local Mac | macOS 15.4.1 arm64; disposable native ad hoc signature, strict resource seal, runtime/session/profile-edit/cold restart passed | Ad hoc identity `-` uses no signing key; it proves neither Developer ID nor notarization |
| Local signing identity | A valid V75 Inc. Developer ID Application identity is listed; duplicate entries refer to the same public certificate | Private-key usability and notarization authentication were not exercised |
| Hosted Mac signing | `desktop-release` has the five expected Apple secret names and valid production public account configuration; main-only branch policy; one required reviewer | Presence is not current credential validation; approval is still required |
| Current protections | Admin bypass enabled, self-review prevention disabled; `ONE_CI_SIGNING_ENABLED=true` and candidate workflow active | Reported unchanged; the release owner controls any policy changes |
| Historical signed candidate | Run [43202853622](https://github.com/V75inc/integral-one/actions/runs/43202853622), source `cc1fe33b1e168c85a94dc5fcb47dec6bf74ac54b`, passed the actual signed build and assembly on 12 November | Different source/artifacts; not qualification of this managed candidate |
| Apple Silicon dependency target | Exact candidate resolves for Python 3.12, macOS 14 arm64; `pgserver==0.1.4` binary helper also resolves | macOS 14 clean-machine acceptance remains separate from this macOS 15.4.1 run |
| Windows x64 dependency target | Exact candidate and its `pgserver==0.1.4` binary helper both resolve | No native Windows execution of this candidate; no `ONE_WINDOWS_CERT_SHA1` in repository/environment variables; provider adapter remains unqualified |
| Intel macOS | Exact candidate resolution fails: `onnxruntime>=1.24.2` has no matching `macosx_14_0_x86_64` wheel | Keep Intel excluded; do not edit Core metadata or downgrade an inference dependency to bypass this |
| Startup reliability | Eight prior packaged cases, 24 successful startups and 44 readiness probes; original failure-stage masking fixed | The original intermittent stall remains unexplained and is not declared resolved |

Three historical signed-candidate runs remain waiting, untouched:
[43129962885](https://github.com/V75inc/integral-one/actions/runs/43129962885)
(`5c9b6203`), [43120206538](https://github.com/V75inc/integral-one/actions/runs/43120206538)
(`961b2d26`), and [43092130047](https://github.com/V75inc/integral-one/actions/runs/43092130047)
(`ca4a7497`). The release owner must reconcile their intended disposition before
approving a new candidate. They are not the current reviewed migration source.
The unsigned Windows development workflow has no recorded runs; the older
successful Windows PostgreSQL probe is historical evidence only.

## Repeatable preparation without signing credentials

Use Node 24, Python 3.12 and the reviewed uv 0.13.4 launcher. Record host OS/arch,
One source SHA plus working-file hashes, Core wheel hash, dependency resolution,
ASAR/installer hashes and every retained test-home path. Use fresh task-owned
homes, never an existing personal workspace or production database.

1. Verify the exact base/composed wheel digests and retain the previous qualified
   Core wheel in a directory containing exactly that wheel.
2. Run `npm run verify`, `npm run test:host`, `npm run qualify:ui` and
   `npm run test:ui` on the reviewed source. Do not infer UI qualification from a
   host-only test. Build the reviewed account/runtime inputs normally.
3. Resolve the exact wheel separately for `aarch64-apple-darwin`,
   `x86_64-apple-darwin` and `x86_64-pc-windows-msvc`, using Python 3.12 and
   `--only-binary onnxruntime`; set `MACOSX_DEPLOYMENT_TARGET=14.0` for Mac targets.
   Separately resolve the candidate's pinned `pgserver` with `--only-binary :all:`.
   Keep failed target logs as evidence; do not override an unsatisfied dependency.
4. Run the actual upgrade gate against the **previous** wheel:

   ```sh
   node scripts/qualify-upgrade.js "$PREVIOUS_CORE_DIRECTORY" \
     --require-settings --retain-evidence
   ```

   For a managed bundle and legacy fixture, this now creates an explicitly
   bounded synthetic plan and invokes the production installer bridge. It checks
   the complete migration receipt before admitting the new credential. Direct
   `integral up` is not a migration test. The gate preserves record/account/key,
   timezone, pin and restart checks. Failures retain the synthetic home; the
   explicit retention flag also retains successful plans, snapshots and journals.
   The signed build's current-wheel smoke is supplementary: it does not replace
   this previous-wheel transition.
5. Build unsigned native DMG/ZIP or NSIS artifacts with signing and publication
   disabled. Run `node scripts/inspect-package.js`. On Mac, verify the DMG checksum,
   mount read-only without launching, inspect, detach, and extract/inspect the ZIP.
   Compare the packaged migration code, capability receipt, wheel, notices and
   account configuration to the reviewed inputs.
6. On a disposable Mac app copy, `node scripts/qualify-mac-signing.js "$DIR"`
   exercises ad hoc signing and the real fresh-runtime/profile/restart check.
   Keep the original unsigned and later Developer ID candidates separate.

## Signed Apple Silicon execution, after authorization

Use a reviewed source/ref admitted by the existing protected environment. Confirm
its version, final artifact provenance and new host compatibility floor first.
Record the dispatched run's actual `head_sha`; reject any mismatch with the
approved source. Do not approve a stale waiting run in place of the new one.

The authorized local route is `npm run build:installers -- --signed`, using the
approved credential configuration from [Mac signing](MACOS-SIGNING.md). The
hosted route is the existing `installer-candidate.yml` with Windows disabled and
the exact approved version. Its main-only environment policy must be respected.
Neither route implicitly authorizes release publication.

After signing, verify the exact ZIP's extracted application:

```sh
codesign --verify --deep --strict "$APP"
codesign -dv --verbose=4 "$APP"
spctl --assess --type execute "$APP"
xcrun stapler validate "$APP"
node scripts/inspect-package.js "$CANDIDATE_DIRECTORY"
npm run release:manifest
```

Check the approved V75 team identity, hardened runtime, actual app ID
`ai.integral.desktop`, stable version and enabled official updater. Validate the
notarization submission and stapled ticket, installer hashes, platform manifest
and update YAML against these exact bytes. Recheck the signed native launcher
digest in `runtime.json`; signing must not change the composed wheel.

On separate clean macOS 14 and supported newer Apple Silicon systems, use only a
fresh or backed-up **synthetic** home. Test clean install, first dependency
provisioning, approved account journey, offline restart, second instance,
protocol callback, record and attachment readback. Then test previous signed
host → candidate host and independent runtime → replacement host. Use the
reviewed plan flags in [managed storage upgrades](MANAGED-STORAGE-UPGRADES.md),
including a home path containing spaces. Verify no-plan refusal, exact approval,
record/attachment/key/account retention, forced trial failure, interrupted
recovery, explicit retry and previous-runtime selection. Retain snapshots and
failed homes. Exercise the real signed updater and automatic relaunch; local
transport rehearsals do not establish published discovery or publisher trust.

## Windows x64 execution, after a native runner/provider is available

First use a Windows x64 build runner with Node 24/Python 3.12/uv 0.13.4. Run the
same host, UI, runtime, previous-wheel and package gates. The existing manual
unsigned workflow may be used only after its dispatch is authorized; it has no
signing secrets and is not a public installer. Do not trigger CI merely by
following this plan.

The signed route additionally requires the approved certificate-store/KSP or
cloud-provider adapter and `ONE_WINDOWS_CERT_SHA1`. The old PFX matrix fields do
not configure that provider. Preserve the reviewed publisher expectation; any
provider/publisher change needs its own reviewed change. Then use the signed
build command and verify both NSIS installer and installed executable:

```powershell
Get-AuthenticodeSignature -LiteralPath $Installer
Get-AuthenticodeSignature -LiteralPath $InstalledExe
node scripts/inspect-package.js
npm run release:manifest
```

Both signatures must be Valid, timestamped and match the approved thumbprint and
publisher. On a clean ordinary-user Windows machine without developer tools,
qualify per-user install, first PostgreSQL provisioning, named process ownership,
port conflict handling, same-home second instance, protocol callbacks, offline
restart and cold update. Invoke the approved migration through the actual
installed executable, for example:

```powershell
& $InstalledExe "--home=$SyntheticHome" `
  "--installer-storage-plan=$ReviewedPlan" `
  "--installer-storage-approved-hash=$ApprovedHash"
```

Use the same migration/failure/attachment matrix as Mac, plus Windows file-lock
and process-shutdown behavior, interrupted NSIS replacement, uninstall with data
retention, and observed SmartScreen prompts. Do not disable OS protection to
obtain a pass. No Windows release artifact is advertised until its own native
and signature gates pass.

## Intel and final closure

Intel is blocked at dependency resolution before signing or installation. The
portable solution belongs in Core. Re-run exact-wheel resolution only after an
upstream candidate changes that result, then require an actual Intel runner and
the complete native matrix before changing platform manifests/support claims.

Keep the original startup stall in release review. On another occurrence, retain
the secret-free journal failure stage/category, command timing, process identity,
control-handshake result, runtime logs after redaction, and the cold snapshot.
Never count a retry as proof that the original problem was fixed. Final closure
requires the release owner's decision on this evidence, final published-artifact
qualification and all advertised native/signing gates.
