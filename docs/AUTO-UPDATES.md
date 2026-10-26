# Integral One updates

Integral One checks for Core releases automatically after the workspace opens and every six hours while it remains open. **Help → Check for Updates…** runs the same check on demand. **Automatically Check for Updates** can be turned off; an existing saved opt-out remains in effect. The menu shows the build's release channel.

Stable builds query the public PyPI JSON API for `integral-core` and exclude prereleases. Development builds query TestPyPI and include release candidates. Checks include newer Core series and accept only non-yanked universal wheels. Installation still requires a matching qualified One release. The rc35 candidate uses the development channel.

A Core publication is delivered through a complete Integral One installer that has passed consumer qualification. One finds a published release in the fixed V75 GitHub repository, checks its channel and exact Core version/wheel hash against the package index, then checks the native installer metadata. If Core is published before an installer is ready, the app reports that preparation is pending. It does not offer an unusable download or replace its engine with a bare wheel.

## User decisions

An available update prompts **Download Update / Later**. **Restart and Install / Later** is a separate decision after the download. Normal quit does not install it. A downloaded update can be installed through Check for Updates during the same session. Automatic notices for a version are shown once per session; a manual check always reports its result. Concurrent checks share one operation. Background connection failures stay quiet, while manual and approved operations show a generic failure message.

Before installation, One confirms that it owns the local runtime, stops it, creates a cold Core backup outside the store, and copies the One account record and local integrity key into the same backup directory. Backups are retained under the stable Integral user-data directory in `update-backups`. A failed stop, backup or account copy prevents installation. Failure after shutdown offers to reopen the installed version. Restoring a backup remains an explicit recovery action.

## Installer and network integrity

Automatic installation is implemented for Apple Silicon macOS 14+ and Windows x64. Source previews and unsupported platforms do not contact release services. Signed native installation and two-version update acceptance must be completed before advertising a platform for public distribution. Intel Mac remains blocked by Core's runtime dependency compatibility.

The release client sends no account token, cookie, installation identifier, workspace record or model credential. It reads only the fixed PyPI/TestPyPI and V75 GitHub endpoints. Metadata is bounded and times out; asset redirects are restricted to GitHub's release hosts. The application does not accept an arbitrary feed URL.

The official electron-updater SDK receives the exact selected GitHub release URL through its generic provider. SDK SHA-512 and native macOS/Windows signature checks remain enabled. One additionally checks the downloaded file's SHA-256 and size against the selected installer manifest. Windows packages pin `V75 Inc.` as the SDK publisher name. The manifest and update YAML are not described as cryptographically signed metadata; the trust boundary includes HTTPS, protected release access and the native publisher signature.

## Release assets

Verified native installers produce schema-2 `install-manifest.json` with the One version, channel, Core version, package index and source wheel hash. Platform parts must agree on all of those fields. `scripts/update-metadata.js` derives `latest-mac.yml` and, when Windows is present, `latest.yml` from those exact bytes. Both feeds carry the Core and channel binding.

Publish stable/PyPI builds as ordinary GitHub releases and development/TestPyPI builds as GitHub prereleases. The updater and one-line bootstraps filter those channels independently. Publish the manifest, matching installers, update YAML and bootstrap scripts together. Signing, notarization and publication require the protected release process described in [the installer runbook](INSTALLER-RELEASE.md).

Tests exercise channel selection, Core version ordering, yanked packages, missing installers, invalid metadata, untrusted redirects, consent, downloaded-byte tampering, backup failure, offline behavior and retention. Before public release, install signed version A and update to signed version B on each advertised native platform, then verify first startup, records, account continuity and recovery. Unit tests and unsigned packaging do not establish that final acceptance.
