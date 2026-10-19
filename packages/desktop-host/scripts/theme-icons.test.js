'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createThemeIcons } = require('../lib/theme-icons');
function fixture(platform) {
  const app = new EventEmitter();
  const nativeTheme = new EventEmitter();
  nativeTheme.shouldUseDarkColors = false;
  const updates = [];
  app.dock = { setIcon: icon => updates.push(icon.variant) };
  const win = { setIcon: icon => updates.push(icon.variant) };
  const nativeImage = { createFromPath: p => ({ variant: p.includes('integral-light') ? 'light' : 'dark', isEmpty: () => false }) };
  const icons = createThemeIcons({ app, nativeTheme, nativeImage, platform, BrowserWindow: { getAllWindows: () => [win] } });
  return { app, nativeTheme, updates, icons };
}
test('macOS Dock follows appearance on launch and after a change', () => {
  const f = fixture('darwin');
  f.icons.start();
  f.nativeTheme.shouldUseDarkColors = true;
  f.nativeTheme.emit('updated');
  f.nativeTheme.shouldUseDarkColors = false;
  f.nativeTheme.emit('updated');
  assert.deepEqual(f.updates, ['dark', 'light', 'dark']);
  f.app.emit('will-quit');
  assert.equal(f.nativeTheme.listenerCount('updated'), 0);
});
test('Windows uses the system surface theme independently of the application theme', () => {
  const f = fixture('win32');
  f.nativeTheme.shouldUseDarkColorsForSystemIntegratedUI = true;
  f.icons.start();
  assert.deepEqual(f.updates, ['light']);
  f.nativeTheme.shouldUseDarkColorsForSystemIntegratedUI = false;
  f.app.emit('browser-window-created');
  assert.deepEqual(f.updates, ['light', 'dark']);
});
test('Linux applies the active theme to native windows', () => {
  const f = fixture('linux');
  f.nativeTheme.shouldUseDarkColors = true;
  f.icons.start();
  assert.equal(f.icons.current().variant, 'light');
  assert.deepEqual(f.updates, ['light']);
});
