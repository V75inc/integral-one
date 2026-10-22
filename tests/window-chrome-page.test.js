'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chrome = require('../frontend/host/window-chrome');

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
  bar.children[1].click();
  assert.deepEqual(popup, [{ id: 'file', x: 8, y: 32 }]);
  assert.equal(theme, 'light');
  assert.equal(document.documentElement.style['--window-titlebar-h'], '32px');
});

function fakeDocument(rail) {
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
      setAttribute(name, value) { node[name] = value; },
      getAttribute(name) { return node[name]; },
      appendChild(child) {
        this.children.push(child);
        node.textContent += child.textContent || '';
        return child;
      },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      click() { for (const fn of listeners.click || []) fn(); },
      getBoundingClientRect() { return { left: 8, bottom: 32 }; },
      classList: { toggle(name, on) { node.className = on ? name : ''; } },
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
    querySelector: selector => selector.includes('sidebar') ? rail : null,
    createElement: make,
  };
}
