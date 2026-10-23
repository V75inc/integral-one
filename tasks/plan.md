# Implementation Plan: Windows title bar

Spec: `docs/SPEC-windows-title-bar.md`

Tasks: `tasks/todo.md`

## Overview

Give the Windows main window one theme-matched row: a sidebar toggle, the existing File / Edit / View / Window / Help menus, a drag area, and the native minimize, maximize, and close buttons. The buttons use the app canvas and ink. The row does not paint “Integral | one”. Mac, the account window, and the splash stay as they are.

## Architecture Decisions

- Electron 44.9.0 draws the caption buttons with `titleBarStyle: 'hidden'` and `titleBarOverlay`. `setTitleBarOverlay` updates the pair when the page theme changes. Official window-controls overlay: color, symbolColor, and height. `ready-to-show` for a hidden overlay window is fixed in 44.4.4, and this app is on 44.9.0, so the existing `show: false` path stays.
- The option is `windowsTitleBar: true` from `desktop/main.js`. The host applies it only for a local `win32` main window. Darwin, remote mode, the splash, and the account window ignore it.
- Caption pairs are fixed: light `#fafafa` / `#0b0b0c`, dark `#1a1a1a` / `#ededed`, height 32. The renderer sends only `'light'` or `'dark'`.
- Menu labels call `submenu.popup` on the installed application menu. Accelerators stay on that menu. `autoHideMenuBar` keeps it hidden until Alt. Popup ids are `file`, `edit`, `view`, `window`, and `help`. Coordinates must be finite and inside the content size. Handlers use `trustedSender`.
- The preload learns the menu list from one `additionalArguments` entry. It does not require a local module, because the sandboxed preload cannot. `windowChrome` is omitted when that argument is absent.
- The pinned Core UI cannot be edited in place, and it has no layout slot for this row. This increment draws the row from `frontend/host`, which is the overlay slot `register.tsx` is meant to fill. The toggle clicks the sidebar’s existing collapse button, then the overlay hides those desktop chevrons. The row moves into Core when a layout slot exists.
- The running app uses the packed host tarball. Ship `0.1.7-dev.5` and point `distribution.json`, `package.json`, and the lockfile at it. Do not publish the package.

## Dependency Graph

```text
Caption map and popup checks
    └── Main-window options, menu ids, and trusted IPC
            └── Preload windowChrome
                    └── Page row and chevron hiding
                            └── One opts in and the host pin updates
```

The page row depends on the preload contract. The pin is last because the app runs the tarball, not the unpacked source.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Enabling the hidden title bar before the page row exists | High | Land the row in the same change as `windowsTitleBar: true`. |
| A popup handler accepts an arbitrary menu or coordinate | High | Allow-list the five ids, require finite in-window coordinates, and keep `trustedSender`. |
| Sandboxed preload cannot `require` the helper | Medium | Pass a JSON argument; parse it inside `preload.js`. |
| Core’s fixed chrome stays under the 32px row | Medium | Overlay CSS offsets the shell, and inline `top` / height values that already use `--system-bar-h` gain `--window-titlebar-h`. |
| Packing the host without updating the pin | Medium | `npm run verify` checks the tarball hash in `distribution.json`. |

## Open Questions

None.
