'use strict';

const CAPTION = {
  light: { color: '#fafafa', symbolColor: '#0b0b0c' },
  dark: { color: '#1a1a1a', symbolColor: '#ededed' },
};
const TITLEBAR_HEIGHT = 32;
const MENU_IDS = new Set(['file', 'edit', 'view', 'window', 'help']);
const CHROME_ARGUMENT = '--integral-window-chrome=';

function captionOverlay(theme) {
  const colors = CAPTION[theme];
  return colors ? { ...colors, height: TITLEBAR_HEIGHT } : null;
}

function popupRequest(id, x, y, contentSize) {
  if (!MENU_IDS.has(id) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const point = { id, x: Math.round(x), y: Math.round(y) };
  const [width, height] = contentSize;
  if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return null;
  return point;
}

function chromeMenus(items) {
  return items
    .filter(item => MENU_IDS.has(item.id) && item.label)
    .map(item => ({ id: item.id, label: item.label }));
}

function chromeArgument(menus) {
  return CHROME_ARGUMENT + JSON.stringify({ height: TITLEBAR_HEIGHT, menus });
}

function readChromeArgument(argv) {
  const raw = argv.find(item => typeof item === 'string' && item.startsWith(CHROME_ARGUMENT));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.slice(CHROME_ARGUMENT.length));
    if (!parsed || !Array.isArray(parsed.menus)) return null;
    return { height: TITLEBAR_HEIGHT, menus: parsed.menus };
  } catch {
    return null;
  }
}

function mainWindowChrome(enabled) {
  if (!enabled) return {};
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: captionOverlay('dark'),
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true,
  };
}

function startupFrame(backgroundColor) {
  const color = backgroundColor || '#171717';
  const light = color.toLowerCase() === '#ffffff' || color.toLowerCase() === '#fff' || color.toLowerCase() === '#fafafa';
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color, symbolColor: light ? '#0b0b0c' : '#ededed', height: TITLEBAR_HEIGHT },
    autoHideMenuBar: true,
  };
}

module.exports = {
  TITLEBAR_HEIGHT,
  captionOverlay,
  popupRequest,
  chromeMenus,
  chromeArgument,
  readChromeArgument,
  mainWindowChrome,
  startupFrame,
};
