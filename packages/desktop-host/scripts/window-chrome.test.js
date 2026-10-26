'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chrome = require('../lib/window-chrome');

test('caption overlay uses the app canvas and ink', () => {
  assert.deepEqual(chrome.captionOverlay('light'), { color: '#fafafa', symbolColor: '#0b0b0c', height: 32 });
  assert.deepEqual(chrome.captionOverlay('dark'), { color: '#1a1a1a', symbolColor: '#ededed', height: 32 });
  assert.equal(chrome.captionOverlay('blue'), null);
});

test('popup accepts the installed menus and a point inside the window', () => {
  assert.deepEqual(chrome.popupRequest('file', 12.4, 32, [1280, 800]), { id: 'file', x: 12, y: 32 });
  assert.equal(chrome.popupRequest('appMenu', 12, 32, [1280, 800]), null);
  assert.equal(chrome.popupRequest('file', Number.NaN, 32, [1280, 800]), null);
  assert.equal(chrome.popupRequest('file', -1, 32, [1280, 800]), null);
  assert.equal(chrome.popupRequest('file', 1281, 32, [1280, 800]), null);
});

test('chrome menus keep the installed labels and skip the macOS app menu', () => {
  const menus = chrome.chromeMenus([
    { role: 'appMenu', label: 'Integral One' },
    { id: 'file', label: 'File' },
    { id: 'edit', label: 'Edit' },
    { id: 'help', label: 'Help' },
  ]);
  assert.deepEqual(menus, [
    { id: 'file', label: 'File' },
    { id: 'edit', label: 'Edit' },
    { id: 'help', label: 'Help' },
  ]);
});

test('the preload argument round-trips the menu list', () => {
  const argument = chrome.chromeArgument([{ id: 'file', label: 'File' }]);
  assert.deepEqual(chrome.readChromeArgument(['electron', argument]), {
    height: 32,
    menus: [{ id: 'file', label: 'File' }],
  });
  assert.equal(chrome.readChromeArgument(['electron']), null);
  assert.equal(chrome.readChromeArgument(['--integral-window-chrome={']), null);
});
