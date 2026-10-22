'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadPreload(argv) {
  let exposed;
  const invoked = [];
  const context = {
    process: { argv },
    require(id) {
      assert.equal(id, 'electron');
      return {
        contextBridge: { exposeInMainWorld(name, value) { assert.equal(name, 'integralDesktop'); exposed = value; } },
        ipcRenderer: { invoke: (...args) => { invoked.push(args); return Promise.resolve(true); } },
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/preload.js'), 'utf8'), context);
  return { exposed, invoked };
}

test('preload hides window chrome unless the main process passed the menu list', () => {
  const plain = loadPreload(['electron']);
  assert.equal(plain.exposed.windowChrome, undefined);
  assert.equal(typeof plain.exposed.session, 'function');
});

test('preload exposes the installed menus and the caption calls', async () => {
  const menus = [{ id: 'file', label: 'File' }, { id: 'help', label: 'Help' }];
  const { exposed, invoked } = loadPreload(['electron', `--integral-window-chrome=${JSON.stringify({ height: 32, menus })}`]);
  assert.equal(exposed.windowChrome.height, 32);
  assert.equal(exposed.windowChrome.menus.map(menu => menu.label).join(','), 'File,Help');
  await exposed.windowChrome.popupMenu('file', 4, 32);
  await exposed.windowChrome.setCaptionTheme('dark');
  assert.deepEqual(invoked, [
    ['integral:window-chrome-popup', 'file', 4, 32],
    ['integral:window-chrome-theme', 'dark'],
  ]);
});

test('preload ignores a malformed window chrome argument', () => {
  const broken = loadPreload(['electron', '--integral-window-chrome={']);
  assert.equal(broken.exposed.windowChrome, undefined);
});
