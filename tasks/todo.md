# Tasks: Windows title bar

Spec: `docs/SPEC-windows-title-bar.md`

Plan: `tasks/plan.md`

## Task 1: Caption colors and popup checks

**Description:** Add a host helper for the light and dark caption pairs, the menu allow-list, and the popup coordinate check.

**Acceptance criteria:**

- [x] Light is `#fafafa` / `#0b0b0c` and dark is `#1a1a1a` / `#ededed`, both with height 32
- [x] An unknown theme produces no overlay
- [x] Popup accepts only `file`, `edit`, `view`, `window`, and `help`, and only a finite point inside the content size

**Verification:**

- [x] Tests pass: `npm test --prefix packages/desktop-host`
- [ ] Build succeeds: not this task
- [ ] Manual check: not this task

**Dependencies:** None

**Files likely touched:**

- `packages/desktop-host/lib/window-chrome.js`
- `packages/desktop-host/scripts/window-chrome.test.js`

**Estimated scope:** Small: 2 files

## Task 2: Windows main-window chrome

**Description:** On a local Windows main window, hide the title bar, install the dark caption overlay, keep the application menu, and register trusted popup and theme IPC. Leave every other window framed.

**Acceptance criteria:**

- [x] The opted-in Windows main window uses the hidden title bar, dark overlay, `#1a1a1a` background, and `autoHideMenuBar`
- [x] The splash window, a Windows window without the flag, a Mac window with the flag, and remote mode do not gain that chrome or the new IPC
- [x] A trusted light theme updates the overlay and the window background; an untrusted sender is rejected

**Verification:**

- [x] Tests pass: `npm test --prefix packages/desktop-host`
- [ ] Build succeeds: not this task
- [ ] Manual check: not this task

**Dependencies:** Task 1

**Files likely touched:**

- `packages/desktop-host/lib/host.js`
- `packages/desktop-host/lib/preload.js`
- `packages/desktop-host/scripts/host.test.js`
- `packages/desktop-host/scripts/preload.test.js`

**Estimated scope:** Medium: 4 files

## Task 3: Page row

**Description:** When `windowChrome` is present, draw the toggle, the host menu labels, and the drag area. Hide the desktop rail chevrons and keep the existing collapse behavior.

**Acceptance criteria:**

- [x] The row lists only the menus the host supplied and does not contain “Integral | one”
- [x] The toggle targets the sidebar’s Collapse sidebar / Expand sidebar button
- [x] The injected sheet hides those two sidebar buttons and offsets shell chrome by the title-bar height
- [x] A saved `t75_theme` of light or dark is the caption theme; a missing value stays dark

**Verification:**

- [x] Tests pass: `node --test tests/window-chrome-page.test.js`
- [x] Build succeeds: esbuild can parse `frontend/host/register.tsx`
- [ ] Manual check: not this task

**Dependencies:** Task 2

**Files likely touched:**

- `frontend/host/window-chrome.js`
- `frontend/host/register.tsx`
- `tests/window-chrome-page.test.js`

**Estimated scope:** Medium: 3 files

## Checkpoint: After Tasks 1-3

- [x] Host tests and the page test pass
- [x] Account window and splash source are unchanged
- [x] Mac does not receive `windowChrome`

## Task 4: Turn the row on and pin the host

**Description:** One’s main window opts in. Pack desktop-host `0.1.7-dev.5` and point the product pin and lockfile at that tarball.

**Acceptance criteria:**

- [x] `desktop/main.js` passes `windowsTitleBar: true` and still sets the window title to `Integral | one`
- [x] `distribution.json` names `vendor/integral-desktop-host-0.1.7-dev.5.tgz` and its sha256
- [x] `npm run verify` passes

**Verification:**

- [x] Tests pass: `npm run test:host` and `npm test`
- [x] Build succeeds: `npm run verify`
- [x] Manual check: the account window and splash constructors are unchanged

**Dependencies:** Checkpoint after Tasks 1-3

**Files likely touched:**

- `desktop/main.js`
- `packages/desktop-host/package.json`
- `package.json`
- `package-lock.json`
- `distribution.json`
- `vendor/integral-desktop-host-0.1.7-dev.5.tgz`

**Estimated scope:** Medium: 6 files

## Checkpoint: Complete

- [x] The spec’s Windows row, caption colors, hidden native menu, and unchanged Mac, account, and splash boundaries are covered by tests
- [x] Ready for review
