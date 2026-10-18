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
