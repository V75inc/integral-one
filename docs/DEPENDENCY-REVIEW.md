# Dependency review — 18 October 2026

This is a development foundation PR, not a production release clearance.
`npm audit` findings must be reported separately from passing functional tests.
The source UI and host remain reviewed Core dependencies; fixes belong upstream.

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
