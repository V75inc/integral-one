# Spec: Windows title bar

Follows [windows title bar idea](ideas/windows-title-bar.md). One capability: the main window’s top row on Windows. The sidebar toggle, menu labels, drag area, and recolored caption buttons ship together. Mac, the account window, and the startup splash are out of this capability.

## Objective

On Windows, Integral One’s main window has one theme-matched row. The page draws a sidebar toggle, the File / Edit / View / Window / Help labels, and the drag area. Windows keeps drawing minimize, maximize, and close. Those labels open the menus the app already installs. The native menu stays installed and hidden until Alt, so keyboard shortcuts are not written a second time. The toggle uses the sidebar collapse the page already has and narrows the left rail to the existing 60px icon strip. The desktop chevron inside the rail is removed so that toggle is the only collapse control.

The user is a person running Integral One on Windows. Success is that the main window’s top row matches the light or dark canvas, the existing menu commands and shortcuts still run, and the rail can be collapsed and expanded without a second control.

Mac stays on the system menu bar, including the chevron in the rail. The Integral Account window and the startup splash keep the window options they have today.

### Resolved decisions

These close the two open questions in the idea.

1. **Caption colors are the app canvas and the app ink.** The native button strip and the page-drawn row use the same pair, so the buttons do not sit on a different rectangle. Windows still paints its own hover and the red close hover. This spec does not replace those.

   | Theme | Button-strip background | Button symbols | Tokens in `vendor/core-ui-source/frontend/src/index.css` |
   | --- | --- | --- | --- |
   | Light | `#fafafa` | `#0b0b0c` | `--bg` and `--text` on `:root` |
   | Dark | `#1a1a1a` | `#ededed` | `--bg` and `--text` on `.theme-dark` |

   `--bg` is the full-window canvas. Light `--section-bg` (`#f4f4f6`) is only the rail, and `--panel` (`#ffffff` / `#212121`) is cards. Neither is the bar. The symbols use the same primary text colors the theme already pairs with that canvas.

2. **The bar does not show the words “Integral \| one”.** The row is the toggle, the menu labels, and an empty drag area. The expanded rail already shows the logo and wordmark. The window title stays `Integral | one` for the taskbar, Alt-Tab, and the splash title. That string is not painted in the drag area.

### Assumptions

1. The pinned Core layout has no window-chrome slot, and `vendor/` is not patched in place. This increment draws the row from the `frontend/host` overlay, which is allowed to replace `register.tsx`. The toggle clicks the sidebar button Core already renders, and the overlay then hides those two desktop chevrons. The collapse state stays in Core `Layout`, including assistant-dock sync. Move the row into Core when a layout slot exists. The preload does not build the row.
2. Electron 44’s Windows caption overlay is the button mechanism: `titleBarStyle: 'hidden'` plus `titleBarOverlay`. One does not draw its own minimize, maximize, or close.
3. The page theme defaults to dark (`detectInitialTheme` in Core `ThemeContext`). The main window therefore starts at `#1a1a1a` and updates if the saved theme is light.
4. The labels are the installed application menu. They are not a second list of commands.
5. Desktop rail widths stay `md:w-[264px]` expanded and `md:w-[60px]` collapsed. The main window’s minimum size is 960×600, which is above the `md` breakpoint, so the Electron window uses that rail and not the mobile drawer.
6. Alt may reveal the native menu as its own row. That is the keyboard path this spec keeps.
7. A desktop-host change reaches the running app only after a local pack and a pin update in this repo. Publishing the host to a registry is not part of this work.

## Tech Stack

- Electron 44.9.0, already the app’s runtime. Window options used: `titleBarStyle`, `titleBarOverlay`, `setTitleBarOverlay`, `setBackgroundColor`, `autoHideMenuBar`, and `Menu` popup.
- The neutral host in `packages/desktop-host` (`@integral/desktop-host`, packed as `0.1.7-dev.5`). One turns the feature on from `desktop/main.js`.
- Core UI, composed from the pinned `vendor/core-ui-source` snapshot plus `frontend/host/`. The row is an overlay on `register.tsx`. `Layout` and `Sidebar` stay in the pinned snapshot.
- Existing theme tokens in Core `index.css`. No new color system and no new npm dependency.
- Windows only for the new chrome. The host ignores the option on every other platform.

## Commands

From the repo root, in PowerShell. Use a task-owned home and profile for any manual launch. Do not point these at an existing Integral installation.

Host contract, after the host change:

```powershell
npm run test:host
```

Distribution and One contract tests, before a commit:

```powershell
npm run verify
```

Page row:

```powershell
node --test tests/window-chrome-page.test.js
```

Manual Windows check of the main window:

```powershell
npm start -- --home=$env:TEMP\integral-one-titlebar-home --user-data-dir=$env:TEMP\integral-one-titlebar-profile
```

Do not run `npm run build:installers`, a signed package, or a release workflow for this feature.

## Project Structure

| Path | Role |
| --- | --- |
| `packages/desktop-host/lib/host.js` | Main-window options, menu ids, caption theme, popup IPC. Splash window in this file stays as it is. |
| `packages/desktop-host/lib/preload.js` | Exposes `window.integralDesktop.windowChrome` on the local Windows main window only. |
| `packages/desktop-host/lib/local-session.js` | Existing `trustedSender`. New IPC uses it and does not widen it. |
| `packages/desktop-host/scripts/host.test.js` | Window options, menu popup allow-list, theme colors, Mac and remote unchanged. |
| `desktop/main.js` | Passes `windowsTitleBar: true`. Window title stays `Integral \| one`. Splash options stay as they are. |
| `desktop/accounts/controller.js` | Account window. No change. |
| `frontend/host/window-chrome.js` | Page row, chevron hiding, and the shell offset. Runs only when `windowChrome` exists. |
| `frontend/host/register.tsx` | Host slot that mounts the row. Replaces Core’s empty stub at composition. |
| `vendor/` | Not edited. |

The desktop host is consumed as `vendor/integral-desktop-host-0.1.7-dev.5.tgz`. Implementation packs a reviewed local tarball and updates this repo’s pin and lockfile. It does not rename the app id `ai.integral.desktop` or the `Integral` user-data directory.

## Code Style

Match the host file you are in. `packages/desktop-host` uses strict CommonJS, single quotes, and semicolons. Caption colors live in one map. The renderer may send only `'light'` or `'dark'`. It does not send CSS colors.

```javascript
const CAPTION = {
  light: { color: '#fafafa', symbolColor: '#0b0b0c' },
  dark: { color: '#1a1a1a', symbolColor: '#ededed' },
};
const TITLEBAR_HEIGHT = 32;

function captionOverlay(theme) {
  const colors = CAPTION[theme] || CAPTION.dark;
  return { ...colors, height: TITLEBAR_HEIGHT };
}
```

The Core row, when that change is made, follows the existing `Layout` and `Sidebar` style: Tailwind utilities, `var(--bg)`, `var(--text)`, and `var(--nav-active-bg)`. It does not add a new color or a second collapse flag.

Menu ids on the installed template are `file`, `edit`, `view`, `window`, and `help`. `help` is omitted when One has no help items. These ids must not collide with `one-automatic-update-checks`. The popup handler accepts only those ids, and only a finite `x` and `y` in the window. Anything else is rejected.

## Behavior

### Main window, Windows

`runDesktop` applies the chrome only when `options.windowsTitleBar === true` and `process.platform === 'win32'`. One’s `desktop/main.js` passes that option. The default stays off, so a remote or Business host that does not opt in is unchanged.

The main `BrowserWindow` then uses:

- `titleBarStyle: 'hidden'`
- `titleBarOverlay` from `captionOverlay('dark')` before the page loads
- `backgroundColor: '#1a1a1a'`
- `autoHideMenuBar: true`
- the existing security `webPreferences`, title lock, and navigation handlers

`Menu.setApplicationMenu` still runs, with the same File, Edit, View, Window, and Help contents. Roles stay roles. Accelerators stay on those items.

The preload adds:

```javascript
windowChrome: {
  height: 32,
  menus: [{ id: 'file', label: 'File' }, /* edit, view, window, help */],
  popupMenu(id, x, y) { /* ipc */ },
  setCaptionTheme(theme) { /* ipc, 'light' | 'dark' */ },
}
```

`menus` is the installed top-level items in order, excluding a macOS `appMenu`. Labels are the menu’s own labels. The page renders that list and does not hardcode a second set of names.

Both IPC handlers require `trustedSender(event, window, workspace)`. `setCaptionTheme` maps the theme through `captionOverlay` and calls `setTitleBarOverlay`. It also calls `setBackgroundColor` with that theme’s `--bg`, so a later resize uses the same canvas. An unknown theme is ignored and the dark overlay stays.

### The row

The host overlay draws the row only when `window.integralDesktop.windowChrome` is present. The row is the top 32px of the window, in the Window Controls Overlay content box (`titlebar-area-x`, `titlebar-area-y`, `titlebar-area-width`, `titlebar-area-height`). It sits above the rail and the page. The rail is not moved into the bar.

Left to right:

1. One icon button, the existing chevron. It clicks the sidebar’s `Collapse sidebar` or `Expand sidebar` button, which is the toggle `Layout` already owns. The title-bar button uses that same accessible name and stays available while the rail is collapsed.
2. One button per `windowChrome.menus` entry. Click, Enter, and Space call `popupMenu` with that id and the button’s bottom-left in window coordinates. Each button is `aria-haspopup="menu"`. The button does not run File, Edit, View, Window, or Help commands itself.
3. The remaining width is a drag region (`-webkit-app-region: drag`) with no text. Double-click on that region still maximizes and restores, which is the overlay drag region’s normal behavior. Buttons are `no-drag`.

The row background is `var(--bg)`. Labels and the toggle use `var(--text)`. Hover and keyboard focus use `var(--nav-active-bg)` and the existing focus ring. The row is one line. It does not wrap, and it does not show a product name.

On first paint, and whenever the theme changes, the page calls `setCaptionTheme` with the active `'light'` or `'dark'` value. Until that call, the native strip and the window background stay dark, which matches the default theme and avoids the current `#ffffff` flash. A saved light theme may show one dark frame, then the light pair.

`--window-titlebar-h` is `32px` while the row is active and `0px` otherwise. Fixed chrome that already offsets by `--system-bar-h` also offsets by `--window-titlebar-h`. That includes the sidebar, the app root, the system notification bar, the assistant dock, and the modal layer. `--system-bar-h` remains the notification height only. The notification bar’s top is the bottom of the title row, not `0`.

### Sidebar

The toggle is the desktop collapse control. Expanded width stays 264px. Collapsed width stays 60px, with icon-only navigation and the mark-only logo. `SidebarDockSync` keeps using the same state: opening the assistant dock collapses the rail, closing it restores only a collapse it caused, and a manual expand while the dock is open still wins.

When `windowChrome` is present, the overlay hides both desktop rail buttons: the expanded “Collapse sidebar” chevron and the collapsed “Expand sidebar” chevron. They stay in the page so the title-bar toggle and `SidebarDockSync` share one state. The mobile drawer’s Open menu and Close menu buttons stay visible. The Electron window cannot shrink below 960px, so that drawer is not the Windows path.

When `windowChrome` is absent, both chevrons stay. That is Mac, a normal browser, and any host that did not opt in.

### What stays put

- Mac main window: no `titleBarStyle: 'hidden'`, no `titleBarOverlay`, no `autoHideMenuBar` change, no `windowChrome`, system menu bar and in-rail chevrons unchanged.
- Account window in `desktop/accounts/controller.js`: title `Integral Account`, background `#171717`, default frame, its own preload and partition.
- Splash `BrowserWindow` inside `runDesktop`: size, title, and background come from `loadingScreen` as they do now (`#171717` for One). It does not use the caption overlay.
- File commands, including Set Up AI Model, microphone access, the installation folder, quit, and the Help update items, remain the existing menu click handlers.

## Testing Strategy

Host tests use the current `node:test` fixtures in `packages/desktop-host/scripts/host.test.js`. They construct a fake `BrowserWindow` and assert options. They do not open Electron.

- With `windowsTitleBar: true` and `process.platform === 'win32'`, the main window has the hidden title bar, the dark overlay (`#1a1a1a` / `#ededed` / height 32), background `#1a1a1a`, and `autoHideMenuBar: true`. The splash window does not.
- `setCaptionTheme('light')` from a trusted sender applies `#fafafa` / `#0b0b0c` and background `#fafafa`. `'dark'` switches back. Any other theme, a bad coordinate, or an unknown menu id does nothing.
- `popupMenu('file', x, y)` pops that item’s existing submenu. The handler does not accept a menu template.
- An untrusted sender is rejected.
- The same flag on `darwin`, and a Windows boot without the flag, leave the main window framed and leave `windowChrome` unset.
- Remote mode still registers no local preload and no local IPC.

Page-row tests live in `tests/window-chrome-page.test.js` and run with `npm test`:

- The row lists the provided menu labels and its text does not contain `Integral | one`.
- The toggle selector is the sidebar’s Collapse sidebar / Expand sidebar button. Open menu and Close menu are not hidden.
- A shell inline offset that mentions `--system-bar-h` also mentions `--window-titlebar-h`. The row does not write `--system-bar-h`.
- Saved theme `light` and `dark` are read from `t75_theme`. A missing value is dark.

Manual check on Windows, in a task-owned profile, after `npm start`:

- Dark startup has no white frame. Light and dark each show one continuous bar, with caption symbols in the ink color above.
- Each label opens the same menu Alt would open. Check for Updates and a role command such as Reload still run. A shortcut such as copy or paste still runs while the native menu is hidden. Alt shows the native menu.
- The toggle narrows the rail to the icon strip and expands it again. No chevron remains in the rail. Opening and closing the assistant dock still collapses and restores the rail.
- The account window and the splash still use their own frames and the splash’s current dark background.
- The row does not contain the text `Integral | one`. The taskbar does.

No coverage threshold is added. The new host cases and the Core row cases above are the required tests.

## Boundaries

- Always: keep the native caption buttons; keep the application menu installed; gate the chrome on Windows and `windowsTitleBar`; use `trustedSender` for the new IPC; preserve `ai.integral.desktop` and the `Integral` data directory; run `npm run test:host` for a host change and `npm run verify` before a commit.
- Ask first: packing the desktop-host tarball and updating the pin, because that changes the artifact One runs; landing or bumping the Core UI pin; any change to the account window, the splash, signing, or installers.
- Never: draw custom minimize, maximize, or close; add a Mac in-window menu bar; hide the rail completely; reimplement menu commands or shortcuts; paint “Integral \| one” in the row; edit `vendor/` in place; inject the bar or hide the chevron from the preload; put secrets in the spec or the host; rename user data or recovery keys.

## Success Criteria

- On Windows the main window’s top row is the sidebar toggle, File, Edit, View, Window, and Help, then a drag area, then the native minimize, maximize, and close buttons.
- Light caption background is `#fafafa` and symbols are `#0b0b0c`. Dark caption background is `#1a1a1a` and symbols are `#ededed`. The page row uses those same tokens. Windows hover and close-hover remain the system’s.
- The row does not contain “Integral \| one”. The taskbar title is still `Integral | one`.
- Choosing a label runs the existing submenu. Hidden-menu shortcuts still run. Alt still opens the installed menu.
- The toggle switches the rail between 264px and 60px. With the Windows bar active, the desktop chevrons are gone and the collapsed rail can still be expanded. Assistant-dock collapse and restore still follow `SidebarDockSync`.
- The main window’s first background is `#1a1a1a`. A saved light theme updates the overlay and the window background to `#fafafa`.
- Mac does not gain this bar or lose its rail chevrons. The account window and the splash keep their current window options.
- `npm run test:host` covers the Windows, Mac, theme, and untrusted-sender cases. `npm test` covers the page row.

## Open Questions

None. The caption colors and the product-name question are decided in Resolved decisions.
