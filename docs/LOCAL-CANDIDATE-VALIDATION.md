# Local Core candidate validation in Integral One

A local Core test wheel used inside One must contain the **composed One UI**,
not an ordinary Core `frontend/dist` build. One's `frontend/host` overlay supplies
branding, account integration, and the native owner-session adapter. Core's
ordinary host session slot intentionally returns `null`.

A generic UI may appear healthy initially because the renderer retains a valid
cached access token. When that token expires, or the user returns after time away,
it cannot renew through One's native bridge. It shows “Your local workspace needs
attention” even while Core and PostgreSQL remain healthy. Do not work around this
by extending token lifetimes, disabling identity verification, or resetting data.

For local candidates:

1. Snapshot the intended Core source with `scripts/distribution.py snapshot`.
2. Compose that snapshot with product `integral-one` and One's full
   `frontend/host` overlay. Build the composed output, with One's isolated public
   asset root. Do not substitute Core's generic frontend build.
3. Record and verify the composition manifest, Core source identity, frontend
   lock identity, and complete overlay inventory/hashes before bundling. Require
   the `session.ts` overlay and verify the compiled bundle includes the native
   bridge. Normal releases use `scripts/bundle-runtime.js` for these boundaries.
4. Run One's verification, the composed UI build and test suite, including the
   real-adapter `session.lifecycle.test.ts` expiry/return regression. Core's
   desktop-session unit tests mock the host adapter and alone cannot catch a
   missing product overlay.
5. Include current dependency metadata in a candidate wheel, not only changed
   Python source. Resolve it before stopping the working runtime.
6. Back up the stopped local runtime, start the candidate, and restart the native
   window so cached assets are replaced. Confirm `/api/auth/local-session` and
   `/api/auth/me` succeed, settings load, and navigation away/back remains healthy.
   Preserve data, identity, provider credentials and the signed application.
7. Distinguish synthetic expiry coverage from a natural-expiry observation in
   the installed app. Report which was actually tested.

A private test package is not a published release. Do not claim the production
package or upstream Core authentication is faulty based solely on a locally
miscomposed candidate.
