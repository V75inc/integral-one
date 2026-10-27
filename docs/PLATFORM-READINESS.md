# Native platform readiness

**27 October:** [0.1.8 is published](https://github.com/V75inc/integral-one/releases/tag/v0.1.8) as a signed and notarized Apple Silicon development preview with Core rc35. Separate-Mac installation/update, automatic restart, real browser account-choice/recovery, display name and data/key retention checks passed on macOS 15.7.7 arm64. Public bootstrap installation and live updater discovery also passed. macOS 14 remains the declared minimum, not an independently tested machine in this run. See [signed qualification](SIGNED-INSTALLER-QUALIFICATION-2026-10-26.md#published-018-development-preview). The earlier rc29 evidence below is historical; Intel, Windows and Linux constraints still apply.

The rc29 source candidate was checked at Core commit `818542ef29390f4350253808668cb4ab13a1334e`.
The published rc29 wheel was subsequently pinned and passed the same local runtime/store/settings checks. Signed installer acceptance remains separate.

| Target | Runtime evidence | Release state |
| --- | --- | --- |
| Apple Silicon, macOS 14+ | rc35 runtime, signed native update/automatic restart, real sign-in and cold-restart retention passed on macOS 15.7.7 arm64. | Signed/notarized 0.1.8 development prerelease published; no stable/latest release. |
| Intel Mac | Resolution fails: the required `onnxruntime>=1.24.2,<2` has no compatible Intel Mac wheel. | Blocked. The owner selected Apple Silicon on macOS 14+ for the initial signed release on 21 October 2026. Intel is excluded from candidate preparation and public manifest assembly until an upstream solution is qualified. |
| Windows x64 | Python 3.12 dependency resolution passes. Earlier rc28 native CI produced an unsigned installer. | rc29 native CI and signed installer/update qualification remain required. |
| Linux | Source/runtime CI exists. | No signed consumer release is claimed. |

Core imports its text encoder lazily, but ONNX Runtime is an unconditional package dependency. This prevents installation on Intel Macs before a keyword-search fallback can help. One must not edit Core's wheel metadata, suppress dependency installation, or select an older unqualified inference runtime to conceal that failure. A portable engine solution belongs upstream in Core.

The Mac application declares macOS 14 as its minimum, matching the current runtime dependency floor. The bootstrap rejects earlier systems before downloading an application. Package inspection verifies the actual application metadata. This is a compatibility constraint, not clean-machine qualification of every macOS release above that floor.

The signed-candidate plan resolves each selected Mac target before requesting access to the protected signing environment. A missing native ONNX wheel fails that read-only plan. Pure Python source distributions remain permitted; requiring wheels for every dependency would incorrectly reject `langdetect`, which does not need a native compiler.

Cross-target checks use the exact composed wheel, Python 3.12, the normal PyPI index and `--only-binary onnxruntime`. `MACOSX_DEPLOYMENT_TARGET=14.0` selects the Mac floor, as documented in the [uv CLI reference](https://docs.astral.sh/uv/reference/cli/). An actual native runtime and signed application test is still required for every advertised target.
