# Licensing

## Integral One source

Integral One is licensed under [Apache License 2.0](LICENSE). Preserve the copyright, attribution and other notices in [NOTICE](NOTICE) when redistributing the source or a built distribution, along with the notices required by applicable component licenses.

Integral Core is also Apache-2.0. Third-party components and separately identified files retain their own licenses. The root license does not replace those terms. Exact source references and pinned artifact identities are recorded in [source provenance](docs/SOURCE-PROVENANCE.json) and the component inventories.

Runtime builds collect installed npm license/notice texts, Electron/Chromium notices
and the uv 0.11.3 MIT notice into application resources under `notices/`.
The generated inventory includes build dependencies and records missing top-level
notice files. It is not a complete native, Python, font or asset SBOM; those
component obligations still require release review. Core's wheel retains its own
LICENSE/NOTICE. Do not describe all third-party code as Apache-2.0.

## Accounts, Apps and Business

An Integral account is not required to exercise Apache source rights: you can clone, build, modify and contribute to this project. Official distribution and hosted-service account requirements are separate from the source license.

Integral Business remains private. This repository does not grant rights to private Business code, separately licensed Apps or hosted services. Independent Apps may use open-source or commercial terms consistent with their own dependencies. No trademark rights or exclusive ownership are implied by this source license.

## Release review

V75 Inc. is the identified legal entity. Contribution authority and rights must be supported by the applicable records; a GitHub repository or provenance entry does not establish copyright assignment.

Before a public release, maintainers must complete the component/dependency/native-runtime and asset review, retain applicable notices in the package, verify source publication contains no private data or secrets, and approve the actual account/privacy/commercial terms. See [release gates](docs/RELEASE-GATES.md).

Apache-2.0 is the adopted licensing direction for Core and One. The earlier SUL proposal was superseded; no SUL or MIT license change is planned.
