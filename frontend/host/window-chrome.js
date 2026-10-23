'use strict';

const RAIL_TOGGLE = '.system-bar-sidebar button[aria-label="Collapse sidebar"], .system-bar-sidebar button[aria-label="Expand sidebar"]';
// Same name as the floating chat button. The :not() keeps this title-bar
// control out of the query, so its click cannot land on itself.
const COWORKER_OPEN = 'button[aria-label="Open Integral coworker"]:not(.one-window-titlebar__coworker)';
const COWORKER_CLOSE = '[data-assistant-dock] button[aria-label="Close chat"]';
const THEME_KEY = 't75_theme';
const OFFSET = 'calc(var(--window-titlebar-h, 0px) + var(--system-bar-h, 0px))';
// Windows caption buttons are about 46px each. Used only when the overlay
// does not report a real caption strip, which is also when a flex child at
// the end of the row sits underneath those buttons.
const CAPTION_FALLBACK = 140;

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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
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
    .one-window-titlebar button:disabled { opacity: 0.38; }
    .one-window-titlebar__drag { flex: 1 1 auto; align-self: stretch; min-width: 12px; -webkit-app-region: drag; }
    .one-window-titlebar__nav,
    .one-window-titlebar__actions {
      display: flex;
      align-items: center;
      align-self: stretch;
      gap: 2px;
      flex: 0 0 auto;
      -webkit-app-region: no-drag;
    }
    .one-window-titlebar button.one-window-titlebar__icon {
      width: 28px;
      padding: 0;
    }
    .one-window-titlebar button.one-window-titlebar__icon[aria-pressed="true"] { background: var(--nav-active-bg); }
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
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
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

function captionInset(view) {
  const rect = view?.navigator?.windowControlsOverlay?.getTitlebarAreaRect?.();
  const width = view?.innerWidth;
  // A zero or full-window rect is "not ready", not a caption. Treating it as
  // the inset pushes the controls off the left edge of the window.
  if (rect && width > 0 && rect.width > 0 && Number.isFinite(rect.x) && Number.isFinite(rect.width)) {
    const caption = Math.round(width - rect.x - rect.width);
    if (caption >= 46 && caption <= 240) return caption;
  }
  return CAPTION_FALLBACK;
}

function chevronIcon(document, direction) {
  const svg = document.createElementNS?.('http://www.w3.org/2000/svg', 'svg') || document.createElement('span');
  if (svg.setAttribute) {
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('aria-hidden', 'true');
  }
  if (!document.createElementNS || !svg.appendChild) return svg;
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevron.setAttribute('d', direction === 'back' ? 'M9.5 3.5 5 8l4.5 4.5' : 'M6.5 3.5 11 8l-4.5 4.5');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '1.5');
  chevron.setAttribute('stroke-linecap', 'round');
  chevron.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(chevron);
  return svg;
}

function coworkerIcon(document) {
  const svg = document.createElementNS?.('http://www.w3.org/2000/svg', 'svg') || document.createElement('span');
  if (svg.setAttribute) {
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('aria-hidden', 'true');
  }
  if (!document.createElementNS || !svg.appendChild) return svg;
  const bubble = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bubble.setAttribute('d', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
  bubble.setAttribute('fill', 'none');
  bubble.setAttribute('stroke', 'currentColor');
  bubble.setAttribute('stroke-width', '2');
  bubble.setAttribute('stroke-linecap', 'round');
  bubble.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(bubble);
  return svg;
}

function onAssistantPage(document) {
  const path = document.defaultView?.location?.pathname || '';
  return path === '/agent' || path.startsWith('/agent/');
}

function canTravel(view, direction) {
  const nav = view?.navigation;
  const key = direction === 'back' ? 'canGoBack' : 'canGoForward';
  if (nav && typeof nav[key] === 'boolean') return nav[key];
  return typeof view?.history?.[direction] === 'function';
}

function travel(view, direction) {
  const nav = view?.navigation;
  if (nav && typeof nav[direction] === 'function') {
    void Promise.resolve(nav[direction]()).catch(() => {});
    return;
  }
  view?.history?.[direction]?.();
}

function syncHistory(view, back, forward) {
  const backDisabled = !canTravel(view, 'back');
  const forwardDisabled = !canTravel(view, 'forward');
  if (back.disabled !== backDisabled) back.disabled = backDisabled;
  if (forward.disabled !== forwardDisabled) forward.disabled = forwardDisabled;
}

function syncCoworker(document, button) {
  const hidden = onAssistantPage(document);
  if (button.hidden !== hidden) button.hidden = hidden;
  const open = Boolean(document.querySelector(COWORKER_CLOSE));
  const label = open ? 'Close chat' : 'Open Integral coworker';
  if (button.getAttribute('aria-label') !== label) {
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }
  const pressed = open ? 'true' : 'false';
  if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
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
  const nav = document.createElement('div');
  nav.className = 'one-window-titlebar__nav';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'one-window-titlebar__icon one-window-titlebar__back';
  back.setAttribute('aria-label', 'Back');
  back.setAttribute('title', 'Back');
  back.appendChild(chevronIcon(document, 'back'));
  back.addEventListener('click', () => travel(document.defaultView, 'back'));
  const forward = document.createElement('button');
  forward.type = 'button';
  forward.className = 'one-window-titlebar__icon one-window-titlebar__forward';
  forward.setAttribute('aria-label', 'Forward');
  forward.setAttribute('title', 'Forward');
  forward.appendChild(chevronIcon(document, 'forward'));
  forward.addEventListener('click', () => travel(document.defaultView, 'forward'));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'one-window-titlebar__icon one-window-titlebar__toggle';
  toggle.appendChild(sidebarIcon(document));
  toggle.addEventListener('click', () => document.querySelector(RAIL_TOGGLE)?.click());
  nav.appendChild(back);
  nav.appendChild(forward);
  nav.appendChild(toggle);
  bar.appendChild(nav);
  syncHistory(document.defaultView, back, forward);
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
  // Keep the row inside the area the page can paint. A fixed control whose
  // inset equals the whole window sits off-screen, to the left of File.
  const actions = document.createElement('div');
  actions.className = 'one-window-titlebar__actions';
  const place = () => {
    bar.style.width = `calc(100% - ${captionInset(document.defaultView)}px)`;
  };
  const coworker = document.createElement('button');
  coworker.type = 'button';
  coworker.className = 'one-window-titlebar__icon one-window-titlebar__coworker';
  coworker.appendChild(coworkerIcon(document));
  coworker.addEventListener('click', () => {
    const target = document.querySelector(COWORKER_CLOSE) || document.querySelector(COWORKER_OPEN);
    target?.click();
  });
  actions.appendChild(coworker);
  syncCoworker(document, coworker);
  bar.appendChild(actions);
  place();
  document.body.appendChild(bar);
  const view = document.defaultView;
  const refresh = () => {
    place();
    syncHistory(view, back, forward);
    syncCoworker(document, coworker);
  };
  view?.addEventListener?.('resize', refresh);
  view?.addEventListener?.('popstate', refresh);
  view?.navigation?.addEventListener?.('currententrychange', refresh);
  view?.navigator?.windowControlsOverlay?.addEventListener?.('geometrychange', place);
  const applyTheme = () => Promise.resolve(chrome.setCaptionTheme(activeTheme(document, read))).catch(() => {});
  void applyTheme();
  if (typeof MutationObserver === 'function' && document.body) {
    new MutationObserver(() => { void applyTheme(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(records => {
      syncToggle(document, toggle);
      syncHistory(document.defaultView, back, forward);
      syncCoworker(document, coworker);
      for (const record of records) {
        if (record.target?.style) patchChromeOffset(record.target.style);
        for (const node of record.addedNodes || []) patchElement(node);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'style'] });
  }
  patchElement(document.documentElement);
}

module.exports = { RAIL_TOGGLE, captionInset, shellCss, storedTheme, patchChromeOffset, patchElement, mountWindowChrome };
