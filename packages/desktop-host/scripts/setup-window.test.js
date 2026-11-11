'use strict';

const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const test = require('node:test');
const { recoverableSetup } = require('../lib/setup-window');

test('failed setup stays open, copies a safe summary, and retries the same launch once', async () => {
  const window = new EventEmitter();
  const frame = {};
  let action;
  let copied;
  let launches = 0;
  const states = [];
  Object.assign(window, {
    isDestroyed: () => false,
    webContents: { mainFrame: frame, send: (_channel, state) => states.push(state) },
  });
  const done = recoverableSetup({
    window,
    ipcMain: {
      handle: (_channel, handler) => { action = handler; },
      removeHandler: () => { action = undefined; },
    },
    clipboard: { writeText: text => { copied = text; } },
    version: '0.1.10',
    start: async report => {
      report('Downloading workspace components...');
      if (++launches === 1) {
        throw Object.assign(new Error('Failed to download https://example.invalid/?token=secret'), { exitCode: 2 });
      }
      return { owned: true };
    },
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.match(states.at(-1).message, /download was interrupted/);
  assert.throws(() => action({ sender: window.webContents, senderFrame: {} }, 'copy'), /Untrusted/);
  const caller = { sender: window.webContents, senderFrame: frame };
  assert.equal(action(caller, 'copy'), true);
  assert.match(copied, /Core exit code: 2/);
  assert.doesNotMatch(copied, /secret|example\.invalid/);
  assert.equal(action(caller, 'retry'), true);
  assert.equal(action(caller, 'retry'), false);
  assert.deepEqual(await done, { owned: true });
  assert.equal(launches, 2);
  assert.equal(action, undefined);
});
