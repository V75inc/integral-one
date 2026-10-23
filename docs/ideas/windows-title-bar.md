# Windows title bar

## Problem Statement

How might we give Integral One on Windows one window bar that matches the app’s light and dark theme, with the menus and a sidebar toggle on that bar?

## Recommended Direction

The app draws the left side of the title bar: a sidebar toggle, the menu labels, and the drag area. Windows keeps drawing minimize, maximize, and close, recolored to the active app theme.

The menu labels open the existing File, Edit, View, Window, and Help menus. The native menu stays installed and hidden until Alt, so keyboard shortcuts do not get a second implementation. The toggle runs the collapse the sidebar already has and narrows the rail to icons. The chevron inside the rail is removed on the desktop so there is one control.

Mac stays on the system menu bar. The account window and the startup splash stay as they are.

## Key Assumptions to Validate

- [ ] A Windows caption overlay can be recolored from the in-app theme and can sit on one row with the page-drawn toggle and menus
- [ ] Pop-up menus from those labels fire the same commands as the keyboard shortcuts
- [ ] The existing sidebar collapse is the right result for the title-bar toggle, and removing the in-rail chevron leaves no way to get stuck collapsed
- [ ] Starting the window in the default dark color avoids a white flash before the page theme loads

## MVP Scope

Windows only. One bar: sidebar toggle, menu labels, drag area, native window buttons. The bar matches light and dark. The left rail narrows to the existing icon strip. Alt still opens the real menu.

## Not Doing (and Why)

- Mac in-window menu bar — the system menu bar already holds those commands
- Custom minimize, maximize, and close — that is where Snap and dragging break
- Hiding the rail completely — the app already has a wide rail and an icon rail, and the icon rail is the chosen collapsed state
- Recoloring the native title while leaving the menu as a second row — that misses the Codex layout
- Moving the icon rail into the title bar — the rail stays the sidebar under the bar
- Account signup and startup splash — they are separate windows and not part of this chrome

## Open Questions

- Which app colors paint the caption buttons in light mode and in dark mode?
- Does the bar show the words “Integral | one”, or only the toggle and the menus?
