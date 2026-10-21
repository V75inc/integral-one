# Dependency review — 18 October 2026

This is a development foundation PR, not a production release clearance.
`npm audit` findings must be reported separately from passing functional tests.
The source UI and host remain reviewed Core dependencies; fixes belong upstream.

## Current rc29 checkpoint — 21 October 2026

One now pins the published TestPyPI rc29 wheel and its exact source tag. The
composed native runtime's resolved Python packages match the audited source
preflight exactly: **no known vulnerabilities found**. This supersedes the older
rc28/Pillow assessment below. Core's decoder restrictions remain in place.

The actual rc29 UI lock audit reports **5 high and 3 moderate propagated
findings**, from braces and sprintf-js. The production closure inspected **3,698
modules** and excludes both affected packages from browser chunks. Vite and
follow-redirects are updated in this consumed release. Desktop production
`npm audit --omit=dev` reports zero findings. Remaining build-tool exposure and
native/asset/component review still require their own disposition.

The installed One runtime and packaged wheel were rebuilt and checked. These
results apply to this exact dependency set; signing/notarization and clean-machine
acceptance remain separate. Earlier checkpoints follow for traceability.

## Findings and disposition

| Advisory | Exposure in this composition | Disposition |
|---|---|---|
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), postcss-selector-parser | CSS build dependency through Tailwind/postcss-nested | Core now overrides the parser to patched 7.1.6; refreshed pinned UI source and reran build/tests. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), braces | Tailwind/chokidar/micromatch/fast-glob build/test dependency tree | Latest published braces 3.0.3 remains affected; no patched version reported. Treat repository glob/build inputs as trusted; qualify an upstream patch or compatible replacement before production release. No forced Tailwind major migration in this PR. |
| [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), sprintf-js | Desktop build tooling via global-agent/roarr; UI dependency tree via mammoth's argparse CLI | Latest published sprintf-js 1.1.3 remains affected. Mammoth's browser conversion API is used; its argparse entry is in the separate CLI. This is exposure analysis, not proof of absence from every artifact. Recheck the packaged closure and qualify a patch/replacement before release. |

The initial audits reported eight moderate desktop-tooling findings and five
high/five moderate UI-tree findings, including propagated parent packages.
The final audit counts after the parser patch are recorded in QUALIFICATION.md.

The repository-readiness review reran both audits: **8 moderate desktop findings;
5 high and 3 moderate UI findings**. The installed npm notice collector and
Electron/Chromium/uv notices improve package attribution; they do not remediate
these advisories or clear the native/asset/component review.
Do not interpret these as ten independent vulnerabilities, zero runtime risk, or
permission to ignore malicious document/extension input. Existing parsing,
access/origin and sanitization protections remain necessary.

Do not use `npm audit fix --force` to downgrade electron-builder or replace
Tailwind/mammoth with incompatible versions. CI installs exact lockfiles. Keep
build agents isolated from production credentials and never execute unreviewed
contribution/package code in a privileged release context.


## Earlier rc28 recheck — 21 October 2026

The root desktop tooling chain now overrides `global-agent` to exact 4.1.3,
removing its old roarr/sprintf-js chain without downgrading electron-builder.
Root `npm audit` reports **zero findings**. A real loopback proxy integration
check preserves the bootstrap API used by the Electron downloader; the native
Electron download and package build also passed with this dependency tree.

The immutable rc28 UI snapshot has its own exact provenance. Its current audit reports
**7 high and 3 moderate propagated findings**, including newer follow-redirects
and Vite/launch-editor advisories as well as braces and sprintf-js. This is not
represented as a clean source audit or an upstream patch.

`npm run qualify:ui:dependencies` rebuilds using the pinned Core Vite config and
examines the actual production module closure. It fails if an advisory-affected
package is present in any browser chunk. The candidate check inspected **3,695
modules** and excluded all four advisory-bearing packages: braces,
follow-redirects, sprintf-js and vite. This corroborates the build-tool/Node-CLI
exposure analysis; it does not establish that all build-time inputs are safe.

The report records the source lock hash, module-closure digest, every emitted
file hash and unresolved advisory URLs in the private qualification directory.
Build only reviewed source and dependencies in an isolated job without release
credentials. Do not run the inherited dev-server/editor-opening feature against
untrusted requests. Keep the protected signed-build review gate; upstream fixes
and owner acceptance of any residual tooling exposure remain distinct decisions.

A rebuilt UI or lock change requires a fresh closure report and package check.
The packaged Electron/runtime/native/component inventory remains separately
reviewable; the UI closure proof is not a licensing clearance.

Updater preparation adds exact electron-updater 6.8.9, semver 7.7.3 and patched
js-yaml 4.3.2; the root audit remains zero. Core's upstream candidate updates Vite
to 8.1.6 and follow-redirects to 1.16.1 with a successful production build and
1,954 frontend tests; its lock audit drops to 5 high/3 moderate propagated
findings, all from unpatched braces/sprintf-js chains. At that earlier checkpoint, those fixes were not part of One's rc28 pin.
The current rc29 checkpoint above supersedes that limitation.

## Earlier Python image assessment — 21 October 2026

An earlier resolved One runtime audit reported eight Pillow 12.3.0 advisories.
The initial Pillow 13 experiment conflicted with FastEmbed's published cap and
was not a valid release dependency set. Core main now incorporates PR #163's
text-only ONNX adapter and compatible Pillow 13, certifi and uv updates. The
updated #165 candidate retains those dependencies; its backend audit reports no
known vulnerabilities. At that earlier checkpoint, One still pinned rc28; the current rc29
checkpoint above records the subsequently published and audited runtime.

Core #165 also restricts decoder dispatch at its three image ingress services:
avatars accept PNG/JPEG/WebP, signature overlays require verified PNG bytes, and
attachment previews accept PNG/JPEG/WebP/first-frame GIF. Both MIME and decoded
format are constrained; spoofed PNG labels cannot invoke TIFF. Other original
attachments remain downloadable. Focused tests include a TIFF decoder trap and
a prohibition on seeking later GIF frames. Refreshed full verification against
main passes, including all 1,978 frontend tests and the full default backend suite.

Do not use a clean Core source audit as clearance for One's older packaged
runtime. Pin a reviewed, published Core artifact, rebuild the actual runtime and
rerun its package audit and qualification before claiming One is remediated.
Trusted extensions and future image paths must preserve the decoder boundaries.
See [Pillow 13 release notes](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html).
