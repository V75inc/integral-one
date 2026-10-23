'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chrome = require('../frontend/host/window-chrome');

test('caption inset keeps controls clear of the native caption buttons', () => {
  assert.equal(chrome.captionInset(undefined, false), 140);
  const overlay = rect => ({
    innerWidth: 1280,
    navigator: { windowControlsOverlay: { getTitlebarAreaRect: () => rect } },
  });
  assert.equal(chrome.captionInset(overlay({ x: 0, width: 1142 }), false), 138);
  assert.equal(chrome.captionInset(overlay({ x: 0, width: 1280 }), false), 140);
  assert.equal(chrome.captionInset(overlay({ x: 0, width: 1280 }), true), 0);
  assert.equal(chrome.captionInset(overlay({ x: 8, width: 1100 }), false), 172);
});

test('stored caption theme follows the page and defaults to dark', () => {
  assert.equal(chrome.storedTheme(() => 'light'), 'light');
  assert.equal(chrome.storedTheme(() => 'dark'), 'dark');
  assert.equal(chrome.storedTheme(() => 'blue'), 'dark');
  assert.equal(chrome.storedTheme(() => { throw new Error('private'); }), 'dark');
});

test('shell offset keeps the system bar variable and adds the title row', () => {
  const style = { top: 'var(--system-bar-h, 0px)', height: 'calc(100dvh - var(--system-bar-h,0px))' };
  chrome.patchChromeOffset(style);
  assert.equal(style.top, 'calc(var(--window-titlebar-h, 0px) + var(--system-bar-h, 0px))');
  assert.match(style.height, /--window-titlebar-h/);
  assert.match(style.height, /--system-bar-h/);
  chrome.patchChromeOffset(style);
  assert.equal(style.top, 'calc(var(--window-titlebar-h, 0px) + var(--system-bar-h, 0px))');
  const css = chrome.shellCss();
  assert.match(css, /100dvh - var\(--window-titlebar-h, 0px\) - var\(--system-bar-h, 0px\)/);
  assert.match(css, /90dvh - var\(--window-titlebar-h, 0px\) - var\(--system-bar-h, 0px\)/);
  assert.match(css, /@media \(min-width: 640px\)/);
});

test('an inserted subtree offsets descendants that only mention the system bar', () => {
  const nested = { style: { minHeight: 'calc(100vh - var(--system-bar-h, 0px))' } };
  const inserted = { style: {}, querySelectorAll: () => [nested] };
  const observers = [];
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(callback) { observers.push(callback); }
    observe() {}
    disconnect() {}
  };
  try {
    const document = fakeDocument({ getAttribute: () => 'Collapse sidebar', click() {} });
    chrome.mountWindowChrome(document, {
      height: 32,
      menus: [],
      popupMenu() {},
      setCaptionTheme() {},
    }, { getItem: () => 'dark' });
    const record = [{ addedNodes: [inserted], target: { style: {} } }];
    for (const callback of observers) callback(record);
    assert.match(nested.style.minHeight, /--window-titlebar-h/);
    assert.match(nested.style.minHeight, /--system-bar-h/);
  } finally {
    if (previous) globalThis.MutationObserver = previous;
    else delete globalThis.MutationObserver;
  }
});

test('the row lists the host menus and toggles the existing rail button', () => {
  let clicks = 0;
  let theme = null;
  const rail = {
    getAttribute: () => 'Expand sidebar',
    click: () => { clicks += 1; },
  };
  const document = fakeDocument(rail);
  const popup = [];
  chrome.mountWindowChrome(document, {
    height: 32,
    menus: [{ id: 'file', label: 'File' }, { id: 'help', label: 'Help' }],
    popupMenu: (id, x, y) => { popup.push({ id, x, y }); },
    setCaptionTheme: value => { theme = value; },
  }, { getItem: () => 'light' });
  const bar = document.body.children[0];
  assert.equal(bar.textContent, 'FileHelp');
  assert.equal(bar.textContent.includes('Integral'), false);
  assert.match(chrome.shellCss(), /Collapse sidebar/);
  assert.match(chrome.shellCss(), /Expand sidebar/);
  assert.equal(chrome.shellCss().includes('Open menu'), false);
  assert.equal(chrome.shellCss().includes('Close menu'), false);
  bar.children[0].click();
  assert.equal(clicks, 1);
  assert.equal(bar.children[0]['aria-label'], 'Expand sidebar');
  const icon = bar.children[0].children[0];
  assert.equal(icon.children.some(part => part.d === 'M10 3 5 8l5 5'), false);
  assert.equal(icon.children.some(part => part.d === 'M6 2.5v11'), true);
  bar.children[1].click();
  assert.deepEqual(popup, [{ id: 'file', x: 8, y: 32 }]);
  assert.equal(theme, 'light');
  assert.equal(document.documentElement.style['--window-titlebar-h'], '32px');
});

test('the coworker control opens and closes through the existing chat buttons', () => {
  let opened = 0;
  let closed = 0;
  let dockOpen = false;
  const open = { click: () => { opened += 1; } };
  const close = { click: () => { closed += 1; } };
  const observers = [];
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(callback) { observers.push(callback); }
    observe() {}
    disconnect() {}
  };
  try {
    const document = fakeDocument(
      { getAttribute: () => 'Collapse sidebar', click() {} },
      null,
      {
        open: () => dockOpen ? null : open,
        close: () => dockOpen ? close : null,
      },
    );
    chrome.mountWindowChrome(document, {
      height: 32,
      menus: [{ id: 'file', label: 'File' }],
      popupMenu() {},
      setCaptionTheme() {},
    }, { getItem: () => 'dark' });
    const bar = document.body.children[0];
    const actions = bar.children[bar.children.length - 1];
    assert.equal(actions.className, 'one-window-titlebar__actions');
    assert.equal(actions.style.right, '140px');
    const coworker = actions.children[1];
    assert.equal(coworker.className, 'one-window-titlebar__icon one-window-titlebar__coworker');
    assert.equal(actions.children[0].className, 'one-window-titlebar__icon one-window-titlebar__fullscreen');
    assert.equal(coworker['aria-label'], 'Open Integral coworker');
    assert.equal(coworker['aria-pressed'], 'false');
    coworker.click();
    assert.equal(opened, 1);
    assert.equal(closed, 0);

    dockOpen = true;
    for (const callback of observers) callback([{ target: { style: {} }, addedNodes: [] }]);
    assert.equal(coworker['aria-label'], 'Close chat');
    assert.equal(coworker['aria-pressed'], 'true');
    coworker.click();
    assert.equal(opened, 1);
    assert.equal(closed, 1);
    assert.match(chrome.shellCss(), /one-window-titlebar__icon\[aria-pressed="true"\]/);
    assert.match(chrome.shellCss(), /one-window-titlebar__actions/);
  } finally {
    if (previous) globalThis.MutationObserver = previous;
    else delete globalThis.MutationObserver;
  }
});

test('the full screen control toggles the host window and stays left of chat', async () => {
  const calls = [];
  let notify;
  const document = fakeDocument({ getAttribute: () => 'Collapse sidebar', click() {} });
  document.defaultView = {
    innerWidth: 1400,
    navigator: { windowControlsOverlay: { getTitlebarAreaRect: () => ({ x: 0, width: 1400 }) } },
  };
  chrome.mountWindowChrome(document, {
    height: 32,
    menus: [{ id: 'view', label: 'View' }],
    popupMenu() {},
    setCaptionTheme() {},
    fullScreen(action) { calls.push(action); return action === 'toggle'; },
    onFullScreen(callback) { notify = callback; },
  }, { getItem: () => 'dark' });
  const actions = document.body.children[0].children.at(-1);
  const button = actions.children[0];
  assert.equal(button['aria-label'], 'Enter full screen');
  assert.equal(button['aria-pressed'], 'false');
  assert.equal(actions.children[1].className, 'one-window-titlebar__icon one-window-titlebar__coworker');
  assert.equal(actions.style.right, '140px');
  button.click();
  assert.deepEqual(calls, ['read', 'toggle']);
  await Promise.resolve();
  assert.equal(button['aria-label'], 'Exit full screen');
  assert.equal(button['aria-pressed'], 'true');
  assert.equal(actions.style.right, '0px');
  notify(false);
  assert.equal(button['aria-label'], 'Enter full screen');
  assert.equal(actions.style.right, '140px');
});

test('the toggle label does not keep notifying itself', () => {
  const observers = [];
  let writes = 0;
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(callback) { observers.push(callback); }
    observe() {}
    disconnect() {}
  };
  try {
    const document = fakeDocument({ getAttribute: () => 'Collapse sidebar', click() {} }, () => {
      writes += 1;
      if (writes > 3) throw new Error('aria-label observer loop');
      for (const callback of observers) callback([{ target: { style: {} }, addedNodes: [] }]);
    });
    chrome.mountWindowChrome(document, {
      height: 32,
      menus: [],
      popupMenu() {},
      setCaptionTheme() {},
    }, { getItem: () => 'dark' });
    assert.equal(writes, 3);
    for (const callback of observers) callback([{ target: { style: {} }, addedNodes: [] }]);
    assert.equal(writes, 3);
  } finally {
    if (previous) globalThis.MutationObserver = previous;
    else delete globalThis.MutationObserver;
  }
});

function fakeDocument(rail, onLabel, targets = {}) {
  const created = [];
  const make = tag => {
    const listeners = {};
    const node = {
      tag,
      id: '',
      className: '',
      textContent: '',
      style: {},
      children: [],
      setAttribute(name, value) {
        node[name] = value;
        if (name === 'aria-label') onLabel?.();
      },
      getAttribute(name) { return node[name]; },
      appendChild(child) {
        this.children.push(child);
        node.textContent += child.textContent || '';
        return child;
      },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { for (const fn of listeners.click || []) fn(); },
      getBoundingClientRect() { return { left: 8, bottom: 32 }; },
      classList: {
        contains(name) { return node.className.split(/\s+/).includes(name); },
        toggle(name, on) { node.className = on ? name : ''; },
      },
    };
    created.push(node);
    return node;
  };
  return {
    documentElement: {
      style: { setProperty(name, value) { this[name] = value; } },
      classList: { contains: () => false },
    },
    head: { children: [], appendChild(node) { this.children.push(node); } },
    body: { children: [], appendChild(node) { this.children.push(node); } },
    getElementById: id => created.find(node => node.id === id) || null,
    querySelector: selector => {
      if (selector.includes('sidebar')) return rail;
      if (selector.includes('Close chat')) return targets.close?.() ?? null;
      if (selector.includes('Open Integral coworker')) return targets.open?.() ?? null;
      return null;
    },
    createElement: make,
    createElementNS: (_namespace, tag) => make(tag),
  };
}
