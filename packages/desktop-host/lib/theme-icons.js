'use strict';
const path = require('node:path');

function createThemeIcons({ app, nativeTheme, nativeImage, BrowserWindow, platform = process.platform, iconRoot = path.join(__dirname, 'icons') }) {
  // macOS uses padded artwork so the Dock's optical size matches its neighbours.
  const base = path.join(iconRoot, ...(platform === 'darwin' ? ['mac'] : []));
  const icons = {
    light: nativeImage.createFromPath(path.join(base, 'integral-light.png')),
    dark: nativeImage.createFromPath(path.join(base, 'integral-dark.png')),
  };
  for (const icon of Object.values(icons)) {
    if (icon.isEmpty()) throw new Error('The Integral desktop icon is missing.');
  }
  // Use the system surface theme, independently of the in-app appearance.
  // Dark surfaces get white artwork; light surfaces get black artwork.
  const current = () => (nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ?? nativeTheme.shouldUseDarkColors)
    ? icons.light : icons.dark;
  const update = () => {
    const icon = current();
    if (platform === 'darwin') app.dock?.setIcon(icon);
    else for (const win of BrowserWindow.getAllWindows()) win.setIcon(icon);
  };
  const start = () => {
    update();
    nativeTheme.on('updated', update);
    app.on('browser-window-created', update);
    app.once('will-quit', () => {
      nativeTheme.removeListener('updated', update);
      app.removeListener('browser-window-created', update);
    });
  };
  return { current, start };
}

module.exports = { createThemeIcons };
