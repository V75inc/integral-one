# Desktop session continuity

Integral One owns installation identity and its native session bridge. Integral
Core owns the shared UI lifecycle. The companion lifecycle change is
[Core PR #171](https://github.com/V75inc/integral-core/pull/171): local-owner
sessions renew without idle prompts or routine login redirects, retain open
work during a runtime interruption, and show reconnection/recovery status.

One's `installation_owner` adapter forwards `session()` to the existing native
IPC channel. That path reads the private installation controller credential in
the main process, validates its installation and loopback origin, and obtains a
finite-lived bearer from `/api/auth/local-session`. The controller credential
never enters the renderer. Renewal does not open account sign-in or depend on
an available central account service; explicit sign-out remains authoritative.

Desktop host 0.1.7-dev.5 shares concurrent exchanges and rechecks authorization
before delivery. Sign-out during an exchange, navigation of the requesting
frame, or replacement of the runtime prevents delivery of the pending result.
Failed exchanges release the pending slot so later recovery can proceed. Token
responses must include a nonempty bearer and a positive, finite lifetime.
The checked-in host archive, dependency lock and distribution digest match the
source package; no application ID, local data path or recovery key changes.

## Integration and release boundary

This PR is based on the latest One main, which pins published Core rc30. That
immutable wheel/UI pin remains intact. The complete automatic-renewal behavior
requires a subsequent qualified Core release containing PR #171 and an ordinary
One Core-pin update. Do not treat this native-bridge change alone as enabling
the new lifecycle in the current rc30 distribution, and do not silently replace
a published wheel with an unreleased build.

Qualify the native host with `npm run test:host`, the distribution with
`npm run verify`, and the pinned UI with `npm run qualify:ui` and
`npm run test:ui`. Also compose the candidate Core UI with `frontend/host` and
run its desktop session, mounted-draft and host-adapter tests before promoting
the next Core pin. Installer signing, publication and migration are separate
release actions.
