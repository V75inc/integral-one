'use strict';

const RAIL_TOGGLE = '.system-bar-sidebar button[aria-label="Collapse sidebar"], .system-bar-sidebar button[aria-label="Expand sidebar"]';
const THEME_KEY = 't75_theme';
const OFFSET = 'calc(var(--window-titlebar-h, 0px) + var(--system-bar-h, 0px))';

function storedTheme(read) {
  try {
    const saved = read();
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Private mode has no saved theme. */ }
  return 'dark';
}

function activeTheme(document, read) {
  if (document.documentElement.classList.contains('theme-dark')) return 'dark';
  return storedTheme(read);
}

function patchChromeOffset(style) {
  for (const prop of ['top', 'height', 'minHeight', 'maxHeight']) {
    const value = style[prop];
    if (typeof value !== 'string' || !value || value.includes('--window-titlebar-h')) continue;
    const next = value.replaceAll('var(--system-bar-h, 0px)', OFFSET).replaceAll('var(--system-bar-h,0px)', OFFSET);
    if (next !== value) style[prop] = next;
  }
}

// React commits a connected subtree as one record. The styled shell nodes are
// descendants of that added node, so patching only the root leaves them short.
function patchElement(node) {
  if (!node) return;
  if (node.style) patchChromeOffset(node.style);
  if (typeof node.querySelectorAll !== 'function') return;
  for (const child of node.querySelectorAll('[style]')) patchChromeOffset(child.style);
}

function utilitySelector(className) {
  return '.' + className.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
}

function offsetDeclaration(className, property, basis) {
  return `${utilitySelector(className)} { ${property}: calc(${basis} - var(--window-titlebar-h, 0px) - var(--system-bar-h, 0px)) !important; }`;
}

function shellCss() {
  return `
    .one-window-titlebar {
      position: fixed;
      z-index: 45;
      top: env(titlebar-area-y, 0px);
      left: env(titlebar-area-x, 0px);
      width: env(titlebar-area-width, 100%);
      height: var(--window-titlebar-h, 32px);
      display: flex;
      align-items: center;
      gap: 2px;
      box-sizing: border-box;
      margin: 0;
      padding: 0 4px;
      background: var(--bg);
      color: var(--text);
      font: 13px/1 system-ui, sans-serif;
      user-select: none;
      -webkit-app-region: drag;
    }
    .one-window-titlebar button {
      -webkit-app-region: no-drag;
      height: 24px;
      margin: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      padding: 0 8px;
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .one-window-titlebar button:hover,
    .one-window-titlebar button:focus-visible { background: var(--nav-active-bg); }
    .one-window-titlebar button:focus-visible { outline: 2px solid var(--focus-ring-color); outline-offset: -2px; }
    .one-window-titlebar__drag { flex: 1 1 auto; align-self: stretch; min-width: 12px; -webkit-app-region: drag; }
    .system-bar-sidebar button[aria-label="Collapse sidebar"],
    .system-bar-sidebar button[aria-label="Expand sidebar"] { display: none !important; }
    .system-bar-layout { padding-top: ${OFFSET} !important; }
    .system-bar-sidebar {
      top: ${OFFSET} !important;
      height: calc(100dvh - var(--window-titlebar-h, 0px) - var(--system-bar-h, 0px)) !important;
    }
    .system-bar-animated { top: var(--window-titlebar-h, 0px) !important; }
    .system-bar-layout .min-h-screen { min-height: calc(100vh - var(--window-titlebar-h, 0px) - var(--system-bar-h, 0px)) !important; }
    .system-bar-layout .h-screen { height: calc(100vh - var(--window-titlebar-h, 0px) - var(--system-bar-h, 0px)) !important; }
    ${offsetDeclaration('h-[calc(100dvh-var(--system-bar-h,0px))]', 'height', '100dvh')}
    ${offsetDeclaration('max-h-[calc(95dvh-var(--system-bar-h,0px))]', 'max-height', '95dvh')}
    @media (min-width: 640px) {
      ${offsetDeclaration('sm:min-h-[calc(85dvh-var(--system-bar-h,0px))]', 'min-height', '85dvh')}
      ${offsetDeclaration('sm:min-h-[calc(80dvh-var(--system-bar-h,0px))]', 'min-height', '80dvh')}
      ${offsetDeclaration('sm:max-h-[calc(95dvh-var(--system-bar-h,0px))]', 'max-height', '95dvh')}
      ${offsetDeclaration('sm:max-h-[calc(90dvh-var(--system-bar-h,0px))]', 'max-height', '90dvh')}
    }
  `;
}

function sidebarIcon(document) {
  const svg = document.createElementNS?.('http://www.w3.org/2000/svg', 'svg') || document.createElement('span');
  if (svg.setAttribute) {
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
  }
  if (!document.createElementNS || !svg.appendChild) return svg;
  const panel = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  panel.setAttribute('x', '1.5');
  panel.setAttribute('y', '2.5');
  panel.setAttribute('width', '13');
  panel.setAttribute('height', '11');
  panel.setAttribute('rx', '1.5');
  panel.setAttribute('fill', 'none');
  panel.setAttribute('stroke', 'currentColor');
  panel.setAttribute('stroke-width', '1.5');
  const rail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  rail.setAttribute('d', 'M6 2.5v11');
  rail.setAttribute('fill', 'none');
  rail.setAttribute('stroke', 'currentColor');
  rail.setAttribute('stroke-width', '1.5');
  svg.appendChild(panel);
  svg.appendChild(rail);
  return svg;
}

function syncToggle(document, toggle) {
  const rail = document.querySelector(RAIL_TOGGLE);
  const label = rail?.getAttribute('aria-label') || 'Collapse sidebar';
  if (toggle.getAttribute('aria-label') !== label) toggle.setAttribute('aria-label', label);
  const collapsed = label === 'Expand sidebar';
  if (toggle.classList.contains('is-collapsed') !== collapsed) toggle.classList.toggle('is-collapsed', collapsed);
}

function mountWindowChrome(document, chrome, storage) {
  if (!chrome || document.getElementById('one-window-titlebar')) return;
  const read = () => storage?.getItem?.(THEME_KEY);
  document.documentElement.style.setProperty('--window-titlebar-h', `${chrome.height || 32}px`);
  const style = document.createElement('style');
  style.textContent = shellCss();
  document.head.appendChild(style);
  const bar = document.createElement('header');
  bar.id = 'one-window-titlebar';
  bar.className = 'one-window-titlebar';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'one-window-titlebar__toggle';
  toggle.appendChild(sidebarIcon(document));
  toggle.addEventListener('click', () => document.querySelector(RAIL_TOGGLE)?.click());
  bar.appendChild(toggle);
  syncToggle(document, toggle);
  for (const menu of chrome.menus) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'one-window-titlebar__menu';
    button.textContent = menu.label;
    button.setAttribute('aria-haspopup', 'menu');
    button.addEventListener('click', () => {
      const rect = button.getBoundingClientRect();
      void Promise.resolve(chrome.popupMenu(menu.id, rect.left, rect.bottom)).catch(() => {});
    });
    bar.appendChild(button);
  }
  const drag = document.createElement('div');
  drag.className = 'one-window-titlebar__drag';
  bar.appendChild(drag);
  document.body.appendChild(bar);
  const applyTheme = () => Promise.resolve(chrome.setCaptionTheme(activeTheme(document, read))).catch(() => {});
  void applyTheme();
  if (typeof MutationObserver === 'function' && document.body) {
    new MutationObserver(() => { void applyTheme(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(records => {
      syncToggle(document, toggle);
      for (const record of records) {
        if (record.target?.style) patchChromeOffset(record.target.style);
        for (const node of record.addedNodes || []) patchElement(node);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'style'] });
  }
  patchElement(document.documentElement);
}

module.exports = { RAIL_TOGGLE, shellCss, storedTheme, patchChromeOffset, patchElement, mountWindowChrome };
