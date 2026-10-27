# Integral One updates

One 0.1.9 adds independent Core runtime updates and a native update panel. Installed 0.1.8 applications need one desktop upgrade to gain this capability. Compatible Core releases after that do not require another Electron binary. The 0.1.9 implementation is undergoing release qualification; the published 0.1.8 installer continues to use complete desktop updates.

## Automatic checks and notifications

Checks run when the workspace opens, every six hours while One remains open, and on wake/window focus when the previous check was at least an hour ago. **Help → Check for Updates…** checks on demand. **Automatically Check for Updates** preserves an existing opt-out. No system daemon runs after One quits.

An available update appears in the native panel and remains available from Help. Where the operating system permits notifications, One also sends a quiet availability or restart-ready notification; clicking it opens the panel. A notice appears once per version per session. The panel shows download progress. Background connection failures stay quiet; failures during a manual check or approved update show a generic message.

**Download Update / Later** and **Restart to Update / Later** are separate decisions. A staged runtime survives application restarts, and Help retains its restart action. Normal quit does not authorize installation: only choosing Restart to Update records the activation request. Failed activation restores the previous runtime and home, retains the failed home for recovery and suppresses automatic retries of that payload. A manual check permits an explicit retry.

## Core and desktop delivery

Stable builds query PyPI and exclude prereleases. Development builds query TestPyPI, including release candidates. Independent runtimes must match the reviewed major/minor series, release channel, host contract, One version range and explicitly qualified platform. A package-index publication alone is not installable. The matching `core-v<version>` GitHub release must contain a complete qualified payload and runtime manifest.

The payload contains the published engine with One's composed UI and dependency notices. Before staging, One downloads the original package-index wheel, verifies both downloads against their hashes and sizes, and compares every engine, metadata and license file. Only One's static UI, distribution descriptor and regenerated wheel RECORD may differ. UI inventory and RECORD hashes are checked. Extraction rejects links, duplicate or unsafe paths and oversized archives. No executable launcher or arbitrary command/feed URL is accepted from update metadata. The reviewed uv launcher remains in the desktop application.

Desktop shell changes continue through signed complete One installers. Native installation is implemented for Apple Silicon macOS 14+ and Windows x64; only platforms with completed signed installer/update acceptance may be advertised. The initial independent runtime publishing lane qualifies and advertises **darwin-arm64 only**. Source previews do not check automatically; Intel Mac remains blocked by Core dependency compatibility.

## Activation and recovery

Runtime files live under the private Integral user-data directory in `runtime-updates`. Before restart, One confirms it owns the engine, stops it, creates the existing cold Core/account backup under `update-backups`, and snapshots the complete cold home beside its existing path. Only Core's three generated Python interpreter links are preserved as literal links; other links and special files prevent snapshot creation. No stop, backup or snapshot failure permits activation.

On relaunch, One journals a trial startup with the staged wheel. The trial must own its process, report the intended Core version and installation identifier, preserve installation keys and account/setup-key bytes, and stop cleanly. Only then is it selected for normal workspace startup. Failed/interrupted trials restore the previous full home and runtime before normal startup. Interrupted recovery resumes from its journal. Live or foreign engine processes prevent replacement. The snapshot, cold backup and failed home are retained locally for explicit recovery; this feature does not provide a post-use downgrade button.

Account outages are independent of update checks and never invalidate activated local data. The app ID, workspace path and recovery keys stay unchanged.

## Network and trust

Release requests omit account tokens/cookies, installation identifiers, records and model credentials. Requests use fixed PyPI/TestPyPI, Python package-file hosts and V75 GitHub endpoints; redirects are restricted to GitHub release hosts. Metadata and downloads have time/size bounds.

Runtime payloads and manifests are **not Developer ID signed or notarized**. Their trust boundary is HTTPS, the fixed package index and V75 repository, protected release access, exact upstream provenance, hashes and the reviewed qualification workflow. The signed application bundle remains unchanged. A compromised release authority is outside these checks; hashes alone do not authenticate a publisher independently of that authority.

Native shell updates retain electron-updater SHA-512/native publisher verification plus One's SHA-256/size checks. Windows pins the approved publisher. Runtime qualification never receives native signing secrets.

See [Core publication](CORE-RELEASE-UPDATES.md), [runtime contract](INDEPENDENT-CORE-UPDATES.md) and [installer release](INSTALLER-RELEASE.md).
