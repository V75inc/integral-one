# Integral desktop-host

Reusable neutral Electron host maintained with Integral One.
Extracted from Core with its source history, Apache license and notices preserved.
Apache-2.0 and inherited NOTICE remain; no prospective licensing cutover.

Products depend on an immutable packed artifact. `runDesktop` accepts productName,
mode (`local`, `remote`, or legacy reference `auto`), resources, iconRoot and explicit userDataName. Local
mode selects the backend single-owner profile and retains controller-only native
sessions. Remote mode imports neither local launcher nor local-session adapter,
starts no database and exposes no local preload. Product code must provide an
approved workspace origin; permissions remain exact-origin/main-frame scoped.

Pack locally with `npm pack --pack-destination <artifact-directory>`. Product
lockfiles pin the resulting tarball integrity. Local artifacts are review inputs,
not registry publication. `npm test` runs the retained native contracts. Product
installers, branding and signing belong to their distribution repositories.

The local host and bundler require neutral runtime composition contract v1 as
well as legacy profile/identity compatibility. Stored owner IDs, data paths and
session/recovery keys do not change. Remote mode starts no local runtime.

Bundled launches require uv-managed Python 3.12, avoiding system Python discovery.
First-time provisioning has a 30-minute bound; other CLI operations retain the
five-minute bound. `startCore({onProgress})` emits fixed, allowlisted download/setup
messages for the startup window's `[role="status"]` element. Subprocess logs and
paths are never forwarded to that window. Reopening reuses completed downloads.

Distributions can supply native `helpMenuItems` and an `onReady` callback.
An optional trusted `beforeWorkspace({runtime})` hook runs after local startup
and before the first workspace window reads its profile. It is never called in
remote mode. Account providers and profile initialization remain product code.
`runDesktop` returns `stopRuntime({requireExclusive})` for a reviewed updater.
It waits for the owned Core process to stop using its PID/creation-time binding,
deduplicates concurrent stop requests and refuses exclusive update preparation
when another process owns the workspace. Failed stops do not authorize app exit.
