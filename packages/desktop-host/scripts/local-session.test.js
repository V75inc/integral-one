'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { localSession, trustedSender } = require('../lib/local-session');
const runtime = { home: '/private/installation', installation_id: 'd'.repeat(32), web_url: 'http://127.0.0.1:19006' };
const record = { installation_id: runtime.installation_id, deployment_profile: 'desktop_single_user', control_token: 'c'.repeat(64) };

test('native session binds the private installation to its local origin without exposing the controller secret', async () => {
  let call;
  const result = await localSession(runtime, { readFile: () => JSON.stringify(record), request: async (url, options) => { call = { url, options }; return { ok: true, json: async () => ({ access_token: 'short-session' }) }; } });
  assert.deepEqual(result, { access_token: 'short-session' });
  assert.equal(call.url.href, 'http://127.0.0.1:19006/api/auth/local-session');
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.headers.Authorization, `Bearer ${record.control_token}`);
  assert.ok(!JSON.stringify(result).includes(record.control_token));
});

test('refuses remote and mismatched installations before making a request', async () => {
  for (const changed of [{ ...runtime, web_url: 'https://remote.test' }, { ...runtime, installation_id: 'other' }]) {
    await assert.rejects(localSession(changed, { readFile: () => JSON.stringify(record), request: async () => { throw new Error('must not fetch'); } }));
  }
});

test('session IPC excludes frames and other windows even at the same origin', () => {
  const mainFrame = { url: runtime.web_url };
  const webContents = { mainFrame };
  const window = { webContents };
  assert.equal(trustedSender({ sender: webContents, senderFrame: mainFrame }, window, runtime.web_url), true);
  assert.equal(trustedSender({ sender: webContents, senderFrame: { url: runtime.web_url } }, window, runtime.web_url), false);
  assert.equal(trustedSender({ sender: {}, senderFrame: mainFrame }, window, runtime.web_url), false);
  mainFrame.url = 'https://attacker.test';
  assert.equal(trustedSender({ sender: webContents, senderFrame: mainFrame }, window, runtime.web_url), false);
});
