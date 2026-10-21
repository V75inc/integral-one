# One 0.1.1 signed Mac candidate

The owner approved use of the existing V75 Developer ID identity and local
`integral-one-notary` Keychain profile after native source qualification passed.
This is an unpublished Apple Silicon/macOS 14+ candidate, not a public release.

- Tested code revision: `2eb662f430d4331d6fce700bf45be6d193e9f1b6`.
- [Windows, Linux and Mac source qualification](https://github.com/V75inc/integral-one/actions/runs/39635953853): passed.
- Core: published TestPyPI `0.1.1rc29`; One version: `0.1.1`.
- Publisher: `Developer ID Application: V75 Inc. (M43V972XU9)`.
- Apple submission: `d5858d72-40e4-40b5-b491-5059a2b49669`, **Accepted**.
- ZIP: `integral-one-0.1.1-mac-arm64.zip`, **171311415 bytes**.
- ZIP SHA-256: `ec59393c21189376e421f43c4d3b13eaada70a956faa571a2841a97fe4edb78a`.

## Verified result

The signed build repeated the actual settings, record, installation-key and
cold-restart retention checks. Startup and a controller session from the
Developer ID-signed runtime passed. Native package inspection passed.

The exact final ZIP was extracted and its strict deep signature, stapled ticket,
app identity/version, approved team, production account configuration and enabled
updater were verified by the installer-manifest helper. An extracted copy with
quarantine present passed Gatekeeper as **Notarized Developer ID**.

On macOS 15.4.1 ARM, the quarantined app was opened using a task-owned profile and
Core home. macOS displayed its normal first-open confirmation, stating Apple
found no malicious software. After opening, the actual production account window
rendered correctly with Google, Microsoft and email signup/sign-in options.
No production profile was replaced, no account was created and no key exported.

## Local stapling recovery

The initial electron-builder pipeline stopped after Apple's acceptance because
stapler could not write `Contents/CodeResources` in the Codex worktree output
(error 73). Retrying there failed. Copying the identical signed app with `ditto`
to a fresh temporary directory allowed normal `stapler staple`, ticket validation,
strict signature verification and Gatekeeper assessment to pass. A control copy
without any placeholder or bundle edits also passed; the root cause of the
location-specific error is not established.

The accepted control copy was archived using electron-builder's `--prepackaged`
mode with the explicit `.app` path, `--publish never`, and signing discovery off.
This preserves the accepted signature and stapled ticket without another signing
or Apple submission. Any earlier task-generated ZIP/blockmap was removed before
archiving because electron-builder can reuse a newer existing archive. The final
ZIP's top-level layout and exact extracted contents passed the manifest gate.
This recovery does not claim the original one-command pipeline completed; retain
that distinction when reproducing a release. No security protection was disabled.

## Remaining acceptance

- Signed whole-application A → B update, invalid-download/signature rejection,
  data retention and recovery on the supported target.
- A separate clean machine, including macOS 14 acceptance; this host is 15.4.1.
- Final real account signup/return, offline restart and service-outage checks.
- Required privacy, component/native-asset and rights/disclosure review.
- Explicit approval before merging/publishing One installers or its update feed.

Intel Mac distribution is blocked by Core's native dependency compatibility.
Windows has an unsigned development installer only; signed Windows remains blocked.
