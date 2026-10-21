# Integral One updates

Candidate implementation, 21 October 2026. The first release must include and
qualify the updater before launch. No public update channel is qualified yet.

New Core package publications are followed by the [Core release-preparation
workflow](CORE-RELEASE-UPDATES.md). It qualifies a complete One update before the
desktop feed can offer it. The desktop never hot-swaps an unreviewed Core wheel.

## User controls

**Help → Check for Updates…** checks the public V75inc/integral-one GitHub
release feed. **Automatically Check for Updates** is opt-in, stored locally,
and checks after startup and every six hours while open. It is independent of
account sign-in. Update requests attach no account token, installation ID,
workspace content or model credential. GitHub receives ordinary connection and
request information; automatic checks can be turned off.

An available stable release prompts **Download Update / Later**. Downloading
requires approval; **Restart and Install / Later** is a separate decision.
Ordinary quit does not install an update. A downloaded update can be installed
through Check for Updates during the same session. After a later launch the SDK
rechecks the feed and cached download. Prereleases and downgrades are excluded;
concurrent checks share one operation. Background connection failures stay quiet.
Requested-operation failures show a generic error without remote response bodies.
An install failure after stopping Core offers to reopen the installed version;
that recovery action does not promise a database rollback.

## Integrity and local continuity

The first supported automatic-update platform is **macOS**. Source launches,
unsigned development candidates, prerelease product versions and other platforms
leave the updater disabled. Signed installer preparation enables it after the
existing production-account, signing and notarization preflight. Windows signing
and updater qualification remain separate gates.

The exact electron-updater 6.8.9 client uses the public GitHub provider generated
by electron-builder 26.15.3. There is no packaged GitHub credential, remote feed
override, renderer updater IPC or custom signature verifier. Full ZIP downloads
retain SDK SHA-512 verification and native Squirrel.Mac signature validation;
differential download is disabled. This SDK generation does not cryptographically
sign update metadata. HTTPS, protected source/release access and native code
signature checks are required. Do not describe its YAML as a signed manifest or
disable OS validation to test an unsigned build.

The desktop host stops its owned Core process using both PID and creation time
and requires a confirmed `state: stopped` response before invoking installation.
A different owner/process identity or failed stop prevents installation. App
replacement does not rename or remove the Integral data directory, account state,
owner identity or recovery keys. Core compatibility/migrations still need testing
for every pin; preventing downgrades does not replace a verified backup.

## Release assets

After native ZIPs pass signature, notarization, identity and account checks, the
signed candidate workflow assembles install-manifest.json, then runs:

```sh
node scripts/update-metadata.js release-assets
```

The script checks both architectures against their verified SHA-256, byte size
and V75 Apple Team ID. It writes one **latest-mac.yml** with both native ZIPs and
their SHA-512 values. The actual SDK architecture selector is tested against this
combined feed. Do not overwrite the YAML with runner-specific files. Publish the
exact matching ZIPs and metadata together in a stable release; metadata must not
point to missing, draft-only or differently signed assets.

Local tests cover consent, duplicate checks, disabled builds, settings, version
rejection, stop/download/install failures, architecture selection and changed
artifact rejection. They do not prove native update installation. Before release,
install signed version A and update to signed version B on Apple Silicon and
Intel. Exercise offline/error behavior, declined download/restart, invalid
signature/checksum rejection, retained records, account continuity and first
startup after a Core upgrade. No public two-version qualification is claimed.

References: [electron-builder v26 update flow](https://www.electron.build/v26/docs/features/auto-update/),
[Electron native updater](https://www.electronjs.org/docs/latest/api/auto-updater).
